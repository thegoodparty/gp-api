/**
 * Temporary script to simulate triggerPollExecution for local testing.
 *
 * Creates ELECTED_OFFICIAL outbound messages for a poll, using phone numbers
 * extracted from a cluster analysis JSON. This is the prerequisite step before
 * running complete-poll.ts.
 *
 * Usage:
 *   npx tsx scripts/trigger-poll.ts <pollId> <path-to-cluster-analysis.json>
 *
 * What it does:
 *   1. Validates the poll exists
 *   2. Reads the cluster analysis JSON to extract unique phone numbers
 *   3. Creates ELECTED_OFFICIAL PollIndividualMessage records for each phone
 *      (with deterministic IDs, so re-running is safe)
 *
 * Skipped (not needed for local testing):
 *   - Contact sampling via People API
 *   - S3 CSV upload
 *   - Slack message to Tevyn
 */
import { readFileSync } from 'fs'
import { Prisma, PrismaClient } from '@prisma/client'
import { v5 as uuidv5 } from 'uuid'
import { PollClusterAnalysisJsonSchema } from '../src/queue/queue.types'
import { normalizePhoneNumber } from '../src/shared/util/strings.util'

const POLL_INDIVIDUAL_MESSAGE_NAMESPACE =
  'a0e5f0a1-2b3c-4d5e-8f70-8192a3b4c5d6' as const

const PERSON_ID_NAMESPACE =
  'b1f6e1b2-3c4d-5e6f-9081-9203b4c5d6e7' as const

const prisma = new PrismaClient()

async function main() {
  const [pollId, jsonPath] = process.argv.slice(2)
  if (!pollId || !jsonPath) {
    console.error(
      'Usage: npx tsx scripts/trigger-poll.ts <pollId> <path-to-cluster-analysis.json>',
    )
    process.exit(1)
  }

  // 1. Validate poll exists
  const poll = await prisma.poll.findUnique({ where: { id: pollId } })
  if (!poll) {
    console.error(`Poll ${pollId} not found`)
    process.exit(1)
  }
  if (!poll.electedOfficeId) {
    console.error('Poll has no elected office')
    process.exit(1)
  }
  console.log(`Poll "${poll.name}" (${pollId})`)

  // 2. Read JSON and extract unique phone numbers
  const raw = readFileSync(jsonPath, 'utf-8')
  const rows = PollClusterAnalysisJsonSchema.parse(JSON.parse(raw))
  const uniquePhones = Array.from(
    new Set(rows.map((r) => normalizePhoneNumber(r.phoneNumber))),
  )
  console.log(
    `Found ${uniquePhones.length} unique phone numbers in ${rows.length} rows`,
  )

  // 3. Check how many outbound messages already exist
  const existing = await prisma.pollIndividualMessage.count({
    where: { pollId, sender: 'ELECTED_OFFICIAL' },
  })
  if (existing > 0) {
    console.log(
      `Poll already has ${existing} outbound messages — upserting to fill gaps`,
    )
  }

  // 4. Create ELECTED_OFFICIAL messages (deterministic IDs, safe to re-run)
  const now = new Date()
  let created = 0
  let skipped = 0

  await prisma.$transaction(
    async (tx) => {
      for (const phone of uniquePhones) {
        // Generate a deterministic person ID from the phone number
        // In production, these come from the People API sample
        const personId = uuidv5(
          `${pollId}-person-${phone}`,
          PERSON_ID_NAMESPACE,
        )
        const messageId = uuidv5(
          `${pollId}-${personId}`,
          POLL_INDIVIDUAL_MESSAGE_NAMESPACE,
        )

        const data: Prisma.PollIndividualMessageUncheckedCreateInput = {
          id: messageId,
          pollId: poll.id,
          personId,
          sentAt: now,
          personCellPhone: phone,
          electedOfficeId: poll.electedOfficeId!,
          sender: 'ELECTED_OFFICIAL',
        }

        await tx.pollIndividualMessage.upsert({
          where: { id: messageId },
          create: data,
          update: { sentAt: now },
        })
        created++
      }
    },
    { timeout: 30000 },
  )

  console.log(`Upserted ${created} ELECTED_OFFICIAL messages (${skipped} unchanged)`)
  console.log(
    `\nDone. Now run:\n  npx tsx scripts/complete-poll.ts ${pollId} ${jsonPath}`,
  )
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
