/**
 * Cleanup: disable email forwarding from existing auto-provisioned
 * info@<domain> addresses to candidate personal accounts. (ENG-7544)
 *
 * For each Domain row in gp-api that has a Forward Email registration,
 * reconciles its aliases to the post-ENG-7543 state:
 *   - Ensures a catch-all (*) alias forwards only to
 *     candidate-domains@goodparty.org.
 *   - Removes any legacy `info` alias that previously forwarded to a
 *     candidate's personal email.
 *
 * Idempotent on re-run: domains already in the post-ENG-7543 state are
 * detected and skipped (no duplicate forwarding rules).
 *
 * ─── Deployment behavior ─────────────────────────────────────────────
 * This is a one-shot backfill. Merging + deploying ships this file into
 * the production Docker image but DOES NOT auto-invoke it. A human must
 * run it explicitly once after ENG-7543 is in prod.
 *
 * ─── How to run post-deploy ──────────────────────────────────────────
 * Recommended (matches the `backfill-voter-file-filter-orgs.ts` flow):
 *
 *   1. Export prod creds locally (pull from AWS Secrets Manager / SSM):
 *        export DATABASE_URL='<prod Postgres URL>'
 *        export FORWARDEMAIL_BASE_URL='<prod FE base URL>'
 *        export FORWARDEMAIL_API_TOKEN='<prod FE token>'
 *
 *   2. Dry-run first and inspect the plan:
 *        npm run build
 *        npx tsx scripts/cleanup-auto-provisioned-info-aliases.ts
 *        # review scripts/output/info-alias-cleanup-detail.jsonl
 *
 *   3. Apply once the plan looks right:
 *        npx tsx scripts/cleanup-auto-provisioned-info-aliases.ts --apply
 *
 *   4. Spot-check 2–3 affected candidates to confirm their personal
 *      inboxes no longer receive info@<domain> mail (AC 6).
 *
 *   5. Post a summary in the team Slack listing what changed (per the
 *      ENG-7506 plan's "Migration / Rollout" section).
 *
 * Alternative invocation paths (heavier; use only if local creds aren't
 * available):
 *   - `aws ecs run-task` against the live gp-api task definition with a
 *     command override pointing at this script. Env vars already baked
 *     in; runs inside the VPC.
 *   - Pulumi one-shot task component in deploy/. Overkill for a true
 *     one-time backfill — don't add infra unless this needs to repeat.
 *
 * Output (written to scripts/output/, gitignored):
 *   info-alias-cleanup-detail.jsonl   — one JSON line per domain processed
 *   info-alias-cleanup-summary.json   — totals + first 50 errors
 *
 * Required env vars (same in every invocation path):
 *   DATABASE_URL              — Postgres connection string
 *   FORWARDEMAIL_BASE_URL     — Forward Email API base URL
 *   FORWARDEMAIL_API_TOKEN    — Forward Email API token (basic-auth user)
 */
import '../dist/configrc'

import { HttpStatus } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import axios, { AxiosInstance, AxiosResponse, isAxiosError } from 'axios'
import { formatISO } from 'date-fns'
import { createWriteStream, mkdirSync, WriteStream } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'

const CANDIDATE_DOMAINS_INBOX = 'candidate-domains@goodparty.org'
const LEGACY_ALIAS_NAME = 'info'
const CATCH_ALL_ALIAS_NAME = '*'
const FE_TIMEOUT_MS = 10000
const FE_PAGE_LIMIT = 1000
const FE_RETRY_BACKOFF_MS = 250
const FE_RETRY_MAX_BACKOFF_MS = 8000
const FE_RETRY_MAX = 5
const PROGRESS_INTERVAL = 25

const OUTPUT_DIR = join(__dirname, 'output')
const DETAIL_PATH = join(OUTPUT_DIR, 'info-alias-cleanup-detail.jsonl')
const SUMMARY_PATH = join(OUTPUT_DIR, 'info-alias-cleanup-summary.json')

type Action =
  | 'skipped-no-fe-registration'
  | 'skipped-domain-not-in-fe'
  | 'skipped-already-clean'
  | 'fixed'
  | 'error'

type DetailEntry = {
  domainId: number
  domain: string
  action: Action
  dryRun: boolean
  steps?: string[]
  warnings?: string[]
  error?: string
}

type Stats = {
  total: number
  fixed: number
  skippedAlreadyClean: number
  skippedNoFeRegistration: number
  skippedDomainNotInFe: number
  errors: { domainId: number; domain: string; error: string }[]
}

interface ForwardEmailAlias {
  id: string
  name: string
  recipients: string[]
  is_enabled: boolean
}

type DomainRow = {
  id: number
  name: string
  emailForwardingDomainId: string | null
}

const isDryRun = !process.argv.includes('--apply')

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

const buildFeClient = (): AxiosInstance => {
  const baseURL = process.env.FORWARDEMAIL_BASE_URL
  const token = process.env.FORWARDEMAIL_API_TOKEN
  if (!baseURL) throw new Error('FORWARDEMAIL_BASE_URL is required')
  if (!token) throw new Error('FORWARDEMAIL_API_TOKEN is required')
  const auth = Buffer.from(`${token}:`).toString('base64')
  return axios.create({
    baseURL,
    timeout: FE_TIMEOUT_MS,
    headers: { Authorization: `Basic ${auth}` },
  })
}

const listAllAliases = async (
  fe: AxiosInstance,
  domain: string,
): Promise<ForwardEmailAlias[]> => {
  const all: ForwardEmailAlias[] = []
  const encoded = encodeURIComponent(domain)
  let page = 1
  let backoff = FE_RETRY_BACKOFF_MS
  let hasMore = true
  while (hasMore) {
    let attempt = 0
    let response: AxiosResponse<ForwardEmailAlias[]> | null = null
    while (response === null) {
      try {
        response = await fe.get<ForwardEmailAlias[]>(
          `/domains/${encoded}/aliases`,
          {
            params: {
              page,
              limit: FE_PAGE_LIMIT,
              paginate: true,
              pagination: true,
            },
          },
        )
      } catch (e) {
        const retriable =
          isAxiosError(e) &&
          e.response?.status === HttpStatus.CONFLICT &&
          attempt < FE_RETRY_MAX
        if (!retriable) throw e
        await sleep(backoff)
        backoff = Math.min(backoff * 2, FE_RETRY_MAX_BACKOFF_MS)
        attempt += 1
      }
    }
    all.push(...response.data)
    const pageCount = Number(response.headers['x-page-count'])
    const pageCurrent = Number(response.headers['x-page-current'])
    const hasHeaderPagination =
      Number.isFinite(pageCount) &&
      Number.isFinite(pageCurrent) &&
      pageCurrent < pageCount
    hasMore = hasHeaderPagination || response.data.length === FE_PAGE_LIMIT
    if (hasMore) {
      page += 1
      await sleep(backoff)
      backoff = Math.min(backoff * 2, FE_RETRY_MAX_BACKOFF_MS)
    }
  }
  return all
}

const domainExistsInFe = async (
  fe: AxiosInstance,
  domain: string,
): Promise<boolean> => {
  try {
    await fe.get(`/domains/${encodeURIComponent(domain)}`)
    return true
  } catch (e) {
    if (isAxiosError(e) && e.response?.status === HttpStatus.NOT_FOUND) {
      return false
    }
    throw e
  }
}

const createCatchAllAlias = (
  fe: AxiosInstance,
  domain: string,
): Promise<AxiosResponse<ForwardEmailAlias>> =>
  fe.post<ForwardEmailAlias>(`/domains/${encodeURIComponent(domain)}/aliases`, {
    name: CATCH_ALL_ALIAS_NAME,
    recipients: CANDIDATE_DOMAINS_INBOX,
  })

const updateAliasRecipients = (
  fe: AxiosInstance,
  domain: string,
  aliasId: string,
  recipients: string,
): Promise<AxiosResponse<ForwardEmailAlias>> =>
  fe.put<ForwardEmailAlias>(
    `/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(aliasId)}`,
    { recipients },
  )

const deleteAlias = (
  fe: AxiosInstance,
  domain: string,
  aliasId: string,
): Promise<AxiosResponse<void>> =>
  fe.delete<void>(
    `/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(aliasId)}`,
  )

const forwardsOnlyToCandidateDomains = (a: ForwardEmailAlias): boolean =>
  a.recipients.length === 1 &&
  a.recipients[0].toLowerCase() === CANDIDATE_DOMAINS_INBOX

const isActiveCleanCatchAll = (a: ForwardEmailAlias): boolean =>
  a.is_enabled && forwardsOnlyToCandidateDomains(a)

const processDomain = async (
  fe: AxiosInstance,
  domainRow: DomainRow,
): Promise<DetailEntry> => {
  const entry: DetailEntry = {
    domainId: domainRow.id,
    domain: domainRow.name,
    action: 'skipped-no-fe-registration',
    dryRun: isDryRun,
    steps: [],
    warnings: [],
  }

  if (!domainRow.emailForwardingDomainId) {
    return entry
  }

  if (!(await domainExistsInFe(fe, domainRow.name))) {
    entry.action = 'skipped-domain-not-in-fe'
    return entry
  }

  const aliases = await listAllAliases(fe, domainRow.name)
  const catchAlls = aliases.filter((a) => a.name === CATCH_ALL_ALIAS_NAME)
  const legacyInfoAliases = aliases.filter(
    (a) => a.name === LEGACY_ALIAS_NAME && !forwardsOnlyToCandidateDomains(a),
  )
  const unexpected = aliases.filter(
    (a) => a.name !== LEGACY_ALIAS_NAME && a.name !== CATCH_ALL_ALIAS_NAME,
  )

  if (unexpected.length > 0) {
    entry.warnings!.push(
      `Unexpected alias names left untouched: ${unexpected
        .map((a) => a.name)
        .join(', ')}`,
    )
  }

  const alreadyClean =
    legacyInfoAliases.length === 0 &&
    catchAlls.length === 1 &&
    isActiveCleanCatchAll(catchAlls[0])
  if (alreadyClean) {
    entry.action = 'skipped-already-clean'
    return entry
  }

  const primaryCatchAll = catchAlls.find(isActiveCleanCatchAll) ?? catchAlls[0]
  const extraCatchAlls = catchAlls.filter((a) => a.id !== primaryCatchAll?.id)

  if (!primaryCatchAll) {
    entry.steps!.push(`create catch-all alias -> ${CANDIDATE_DOMAINS_INBOX}`)
    if (!isDryRun) await createCatchAllAlias(fe, domainRow.name)
  } else if (!isActiveCleanCatchAll(primaryCatchAll)) {
    entry.steps!.push(
      `update catch-all (${primaryCatchAll.id}) recipients -> ${CANDIDATE_DOMAINS_INBOX}`,
    )
    if (!isDryRun) {
      await updateAliasRecipients(
        fe,
        domainRow.name,
        primaryCatchAll.id,
        CANDIDATE_DOMAINS_INBOX,
      )
    }
  }

  for (const extra of extraCatchAlls) {
    entry.steps!.push(`delete duplicate catch-all (${extra.id})`)
    if (!isDryRun) await deleteAlias(fe, domainRow.name, extra.id)
  }

  for (const info of legacyInfoAliases) {
    entry.steps!.push(
      `delete legacy info alias (${info.id}) recipients=[${info.recipients.join(', ')}]`,
    )
    if (!isDryRun) await deleteAlias(fe, domainRow.name, info.id)
  }

  entry.action = 'fixed'
  return entry
}

const recordEntry = (
  entry: DetailEntry,
  stats: Stats,
  detailStream: WriteStream,
): void => {
  if (entry.action === 'fixed') stats.fixed++
  if (entry.action === 'skipped-already-clean') stats.skippedAlreadyClean++
  if (entry.action === 'skipped-no-fe-registration') {
    stats.skippedNoFeRegistration++
  }
  if (entry.action === 'skipped-domain-not-in-fe') {
    stats.skippedDomainNotInFe++
  }
  detailStream.write(JSON.stringify(entry) + '\n')
}

const main = async () => {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const prisma = new PrismaClient()
  const fe = buildFeClient()
  const detailStream = createWriteStream(DETAIL_PATH, { flags: 'w' })
  const stats: Stats = {
    total: 0,
    fixed: 0,
    skippedAlreadyClean: 0,
    skippedNoFeRegistration: 0,
    skippedDomainNotInFe: 0,
    errors: [],
  }

  try {
    const startedAt = formatISO(new Date())
    const mode = isDryRun ? 'dry-run (no changes applied)' : 'APPLY'
    console.log(`Info-alias cleanup started at ${startedAt} (${mode})`)
    console.log(`Streaming detail to: ${DETAIL_PATH}\n`)

    const domains = await prisma.domain.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, emailForwardingDomainId: true },
    })
    stats.total = domains.length

    let processed = 0
    for (const d of domains) {
      try {
        const entry = await processDomain(fe, d)
        recordEntry(entry, stats, detailStream)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        stats.errors.push({
          domainId: d.id,
          domain: d.name,
          error: message,
        })
        detailStream.write(
          JSON.stringify({
            domainId: d.id,
            domain: d.name,
            action: 'error',
            dryRun: isDryRun,
            error: message,
          } satisfies DetailEntry) + '\n',
        )
      }

      processed += 1
      if (processed % PROGRESS_INTERVAL === 0) {
        console.log(
          `  progress: ${processed}/${stats.total} processed (` +
            `${stats.fixed} fixed, ` +
            `${stats.skippedAlreadyClean} already clean, ` +
            `${stats.errors.length} errors)`,
        )
      }
    }

    const completedAt = formatISO(new Date())
    await writeFile(
      SUMMARY_PATH,
      JSON.stringify(
        {
          startedAt,
          completedAt,
          dryRun: isDryRun,
          total: stats.total,
          fixed: stats.fixed,
          skippedAlreadyClean: stats.skippedAlreadyClean,
          skippedNoFeRegistration: stats.skippedNoFeRegistration,
          skippedDomainNotInFe: stats.skippedDomainNotInFe,
          errors: stats.errors.length,
          errorDetails: stats.errors.slice(0, 50),
        },
        null,
        2,
      ) + '\n',
    )

    console.log(`\nCleanup complete at ${completedAt}`)
    console.log(`Mode: ${mode}`)
    console.log(`Total domains: ${stats.total}`)
    console.log(`Fixed: ${stats.fixed}`)
    console.log(`Already clean: ${stats.skippedAlreadyClean}`)
    console.log(
      `No FE registration (skipped): ${stats.skippedNoFeRegistration}`,
    )
    console.log(`Domain missing in FE (skipped): ${stats.skippedDomainNotInFe}`)
    console.log(`Errors: ${stats.errors.length}`)
    if (stats.errors.length > 0) {
      console.log(`First 10 errors:`)
      for (const err of stats.errors.slice(0, 10)) {
        console.log(`  Domain ${err.domain} (id ${err.domainId}): ${err.error}`)
      }
    }
    console.log(`\nDetail: ${DETAIL_PATH}`)
    console.log(`Summary: ${SUMMARY_PATH}`)
  } finally {
    detailStream.end()
    await new Promise<void>((resolve) => detailStream.on('finish', resolve))
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('Cleanup failed:', e)
  process.exit(1)
})
