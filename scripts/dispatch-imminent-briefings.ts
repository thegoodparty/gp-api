import 'dotenv/config'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '../src/generated/prisma'
import { createClerkClient } from '@clerk/backend'

const BRIEFING_COST_USD = 3.9
const TOKEN_TTL_SECONDS = 3600
const DEFAULT_TARGET = 100

type DispatchRecord = {
  electedOfficeId: string
  organizationSlug: string
  httpStatus: number
  dispatched: boolean
  ok: boolean
  ts: string
}

const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const mintToken = async (): Promise<string> => {
  const clerk = createClerkClient({
    secretKey: requireEnv('CLERK_SECRET_KEY'),
    publishableKey: requireEnv('CLERK_PUBLISHABLE_KEY'),
  })
  // Mint with the caller machine secret (gp-admin's GP_PROD_MACHINE_SECRET),
  // not gp-api's GP_WEBAPP_MACHINE_SECRET. gp-api verifies as the recipient,
  // so the token must be issued by a machine connected to it in Clerk.
  const minted = await clerk.m2m.createToken({
    machineSecretKey: requireEnv('GP_PROD_MACHINE_SECRET'),
    secondsUntilExpiration: TOKEN_TTL_SECONDS,
  })
  if (!minted.token) throw new Error('Clerk did not return an m2m token')
  return minted.token
}

const confirm = async (message: string): Promise<boolean> => {
  const rl = createInterface({ input: stdin, output: stdout })
  const answer = await rl.question(message)
  rl.close()
  return answer.trim().toLowerCase() === 'y'
}

// Fisher-Yates shuffle for a fair random sample of eligible offices.
const shuffle = <T>(items: T[]): T[] => {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

type Office = { id: string; organizationSlug: string }

async function main() {
  const apiUrl = process.env.PROD_API_URL ?? 'https://api.goodparty.org'
  const databaseUrl = requireEnv('PROD_DATABASE_URL')
  const concurrency = Number(process.env.CONCURRENCY ?? '5')
  const dryRun = process.argv.includes('--dry-run')
  const targetArg = process.argv.find((a) => a.startsWith('--target='))
  const target = targetArg ? Number(targetArg.split('=')[1]) : DEFAULT_TARGET

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const allOffices = await prisma.electedOffice.findMany({
    select: { id: true, organizationSlug: true },
  })
  await prisma.$disconnect()

  const pool = shuffle(allOffices)
  const maxEstimate = target * BRIEFING_COST_USD

  if (dryRun) {
    console.log(
      [
        'DRY RUN — no token minted, no dispatches sent.',
        `Target:          ${apiUrl}`,
        `Prod offices:    ${pool.length} (shuffled)`,
        `Goal:            ${target} briefings actually dispatched`,
        `Gate:            useImminenceGate=true (5-day window + dedupe)`,
        `Concurrency:     ${concurrency}`,
        `Max est. cost:   ~$${maxEstimate.toFixed(2)} (at the target)`,
        '',
        'The endpoint self-filters: offices with no meeting in the next 5 days',
        '(or already covered by a future briefing) return dispatched:false and',
        'cost nothing. We walk the shuffled pool until the target is reached.',
        '',
        'Sample order:',
        ...pool.slice(0, 10).map((o) => `  ${o.id}  ${o.organizationSlug}`),
      ].join('\n'),
    )
    return
  }

  const proceed = await confirm(
    [
      `Target:        ${apiUrl}`,
      `Prod offices:  ${pool.length} (shuffled)`,
      `Goal:          ${target} briefings dispatched (5-day imminence gate)`,
      `Concurrency:   ${concurrency}`,
      `Max est. cost: ~$${maxEstimate.toFixed(2)} (hard cap at the target)`,
      '',
      'Proceed? (y/N) ',
    ].join('\n'),
  )
  if (!proceed) {
    console.log('Aborted.')
    return
  }

  mkdirSync(join(__dirname, 'output'), { recursive: true })
  const logPath = join(
    __dirname,
    'output',
    `dispatch-imminent-briefings.${new Date().toISOString()}.jsonl`,
  )

  // A run that walks a few thousand offices at this concurrency finishes well
  // inside the 1h token TTL, so mint once.
  const token = await mintToken()
  const records: DispatchRecord[] = []
  let dispatched = 0
  // Slots claimed by in-flight or completed dispatches. Workers claim a slot
  // synchronously before each call so the concurrent pool can never push
  // `dispatched` past `target` and blow the cost cap. A skip releases its slot.
  let reserved = 0
  let index = 0

  const callDispatch = async (office: Office): Promise<boolean> => {
    let httpStatus = 0
    let didDispatch = false
    try {
      const res = await fetch(`${apiUrl}/v1/meetings/briefings/dispatch`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          electedOfficeId: office.id,
          kind: 'briefing',
          useImminenceGate: true,
        }),
      })
      httpStatus = res.status
      if (res.ok) {
        const body: unknown = await res.json()
        didDispatch =
          typeof body === 'object' &&
          body !== null &&
          'dispatched' in body &&
          body.dispatched === true
      }
    } catch {
      httpStatus = 0
    }
    const record: DispatchRecord = {
      electedOfficeId: office.id,
      organizationSlug: office.organizationSlug,
      httpStatus,
      dispatched: didDispatch,
      ok: httpStatus >= 200 && httpStatus < 300,
      ts: new Date().toISOString(),
    }
    records.push(record)
    appendFileSync(logPath, `${JSON.stringify(record)}\n`)
    return didDispatch
  }

  const runStart = new Date().toISOString()
  const workers = Array.from(
    { length: Math.min(concurrency, pool.length) },
    () =>
      (async () => {
        while (dispatched < target && index < pool.length) {
          // Claim a slot synchronously — no await between the check and the
          // increment — so two workers can never both take the last one.
          if (reserved >= target) {
            await new Promise((resolve) => setTimeout(resolve, 25))
            continue
          }
          reserved++
          const did = await callDispatch(pool[index++])
          if (did) {
            dispatched++
            if (dispatched % 10 === 0) {
              console.log(`  dispatched ${dispatched}/${target}`)
            }
          } else {
            // A skip consumed no briefing; free the slot for another office.
            reserved--
          }
        }
      })(),
  )
  await Promise.all(workers)
  const runEnd = new Date().toISOString()

  const okCalls = records.filter((r) => r.ok).length
  const failures = records.filter((r) => !r.ok)

  console.log(
    JSON.stringify(
      {
        goal: target,
        dispatched,
        callsMade: records.length,
        okCalls,
        skipped: okCalls - dispatched,
        failures: failures.map((r) => ({
          electedOfficeId: r.electedOfficeId,
          httpStatus: r.httpStatus,
        })),
        estCostUsd: Number((dispatched * BRIEFING_COST_USD).toFixed(2)),
        logPath,
        reconcile: { runStart, runEnd },
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
