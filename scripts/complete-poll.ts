/**
 * Temporary script to take a poll from SCHEDULED → COMPLETED.
 *
 * Usage:
 *   npx tsx scripts/complete-poll.ts <pollId> <path-to-cluster-analysis.json>
 *
 * Example:
 *   npx tsx scripts/complete-poll.ts 019c29d4-81aa-733e-a72a-3983baf19a22 ./responses.json
 *
 * What it does:
 *   1. Validates the poll exists and is in SCHEDULED or IN_PROGRESS state
 *   2. Reads the cluster analysis JSON (same format as all_cluster_analysis files)
 *   3. Synthesizes poll issues from the clusters
 *   4. Creates CONSTITUENT individual messages with issue join records
 *   5. Marks the poll as completed
 *
 * Prerequisites:
 *   - DATABASE_URL must be set (reads from .env automatically via Prisma)
 *   - The poll must already have ELECTED_OFFICIAL outbound messages
 *     (i.e. triggerPollExecution must have run, or messages must exist)
 */
import { readFileSync } from 'fs'
import {
  PollConfidence,
  PollIndividualMessageSender,
  Prisma,
  PrismaClient,
} from '@prisma/client'
import { groupBy } from 'es-toolkit'
import { v5 as uuidv5 } from 'uuid'
import {
  PollClusterAnalysisJsonSchema,
  type PollResponseJsonRow,
} from '../src/queue/queue.types'
import { normalizePhoneNumber } from '../src/shared/util/strings.util'
import { APIPollStatus, derivePollStatus } from '../src/polls/polls.types'

const POLL_INDIVIDUAL_MESSAGE_NAMESPACE =
  'a0e5f0a1-2b3c-4d5e-8f70-8192a3b4c5d6' as const

const prisma = new PrismaClient()

async function main() {
  const [pollId, jsonPath] = process.argv.slice(2)
  if (!pollId || !jsonPath) {
    console.error(
      'Usage: npx tsx scripts/complete-poll.ts <pollId> <path-to-cluster-analysis.json>',
    )
    process.exit(1)
  }

  // 1. Load and validate poll
  const poll = await prisma.poll.findUnique({ where: { id: pollId } })
  if (!poll) {
    console.error(`Poll ${pollId} not found`)
    process.exit(1)
  }
  const status = derivePollStatus(poll)
  if (
    ![APIPollStatus.SCHEDULED, APIPollStatus.IN_PROGRESS].includes(status)
  ) {
    console.error(
      `Poll is in ${status} state, expected SCHEDULED or IN_PROGRESS`,
    )
    process.exit(1)
  }
  const electedOfficeId = poll.electedOfficeId
  if (!electedOfficeId) {
    console.error('Poll has no elected office')
    process.exit(1)
  }
  console.log(`Poll "${poll.name}" (${pollId}) is ${status}`)

  // 2. Read and parse the cluster analysis JSON
  const raw = readFileSync(jsonPath, 'utf-8')
  const rows = PollClusterAnalysisJsonSchema.parse(JSON.parse(raw))
  console.log(`Loaded ${rows.length} rows from ${jsonPath}`)

  // 3. Synthesize issues from clusters
  const clusterRows = rows.filter(
    (r) => r.clusterId !== '' && r.clusterId !== undefined && r.clusterId != null,
  )
  const clusterGroups = groupBy(clusterRows, (r) => String(r.clusterId))
  const issues = Object.entries(clusterGroups).map(([clusterId, group]) => {
    const first = group[0]
    const uniquePhones = new Set(group.map((r) => r.phoneNumber))
    return {
      rank: Number(clusterId),
      theme: first.theme,
      summary: first.summary,
      responseCount: uniquePhones.size,
      quotes: group.slice(0, 3).map((r) => ({
        quote: r.originalMessage,
      })),
    }
  })
  console.log(
    `Synthesized ${issues.length} issues:`,
    issues.map((i) => `  #${i.rank} "${i.theme}" (${i.responseCount} responses)`),
  )

  // 4. Delete existing issues and create new ones
  await prisma.pollIssue.deleteMany({ where: { pollId } })
  await prisma.pollIssue.createMany({
    data: issues.map((issue) => ({
      id: `${pollId}-${issue.rank}`,
      pollId,
      title: issue.theme,
      summary: issue.summary,
      details: issue.summary,
      mentionCount: issue.responseCount,
      representativeComments: issue.quotes,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  })
  console.log(`Created ${issues.length} poll issues`)

  // 5. Map phone numbers to person IDs from existing outbound messages
  const phoneNumbers = Array.from(
    new Set(rows.map((r) => normalizePhoneNumber(r.phoneNumber))),
  )
  const outboundMessages = await prisma.pollIndividualMessage.findMany({
    where: {
      electedOfficeId,
      pollId,
      personCellPhone: { in: phoneNumbers },
      sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
    },
  })
  const phoneToPersonId = new Map(
    outboundMessages.map((m) => [
      normalizePhoneNumber(m.personCellPhone!),
      m.personId,
    ]),
  )
  console.log(
    `Mapped ${phoneToPersonId.size}/${phoneNumbers.length} phone numbers to person IDs`,
  )

  // 6. Build constituent messages and join records
  const groups = groupBy(
    rows,
    (r: PollResponseJsonRow) => `${r.phoneNumber}\n${r.receivedAt ?? ''}`,
  )
  const validIssueIds = new Set(issues.map((i) => i.rank))

  const scalarData: Prisma.PollIndividualMessageCreateManyInput[] = []
  const joinValues: Prisma.Sql[] = []
  let skipped = 0

  for (const [, groupRows] of Object.entries(groups)) {
    const first = groupRows[0]
    const { phoneNumber, originalMessage, receivedAt } = first
    const normalizedPhone = normalizePhoneNumber(phoneNumber)
    const personId = phoneToPersonId.get(normalizedPhone)
    if (!personId) {
      skipped++
      continue
    }

    const uuid = uuidv5(
      `${pollId}-${personId}-${receivedAt}`,
      POLL_INDIVIDUAL_MESSAGE_NAMESPACE,
    )
    const isOptOut = groupRows.some((r) => Boolean(r.isOptOut))
    const sentAt = receivedAt ? new Date(receivedAt) : new Date()

    scalarData.push({
      id: uuid,
      personId,
      personCellPhone: normalizedPhone,
      sentAt,
      isOptOut,
      sender: PollIndividualMessageSender.CONSTITUENT,
      content: originalMessage,
      electedOfficeId,
      pollId,
    })

    const seenIssueIds = new Set<string>()
    for (const row of groupRows) {
      const cid = row.clusterId
      if (cid === '' || cid === undefined || cid == null) continue
      const issueId = `${pollId}-${cid}`
      if (validIssueIds.has(Number(cid)) && !seenIssueIds.has(issueId)) {
        seenIssueIds.add(issueId)
        joinValues.push(Prisma.sql`(${uuid}, ${issueId})`)
      }
    }
  }

  if (skipped > 0) {
    console.log(
      `Skipped ${skipped} response groups (no matching outbound message)`,
    )
  }

  // 7. Write constituent messages + joins in a transaction
  const idsToReplace = scalarData.map((d) => d.id)
  await prisma.$transaction(async (tx) => {
    await tx.pollIndividualMessage.deleteMany({
      where: {
        id: { in: idsToReplace },
        pollId,
        sender: PollIndividualMessageSender.CONSTITUENT,
      },
    })
    await tx.pollIndividualMessage.createMany({ data: scalarData })
    if (joinValues.length > 0) {
      await tx.$executeRaw`
        INSERT INTO "_PollIndividualMessageToPollIssue" ("A", "B")
        VALUES ${Prisma.join(joinValues, ', ')}
      `
    }
  })
  console.log(
    `Created ${scalarData.length} constituent messages with ${joinValues.length} issue links`,
  )

  // 8. Calculate confidence and mark complete
  const totalResponses = scalarData.filter((d) => !d.isOptOut).length
  const totalConstituents = await prisma.pollIndividualMessage.count({
    where: { pollId, sender: PollIndividualMessageSender.ELECTED_OFFICIAL },
  })
  const highConfidence =
    totalResponses > 75 ||
    (totalConstituents > 0 && totalResponses / totalConstituents >= 0.1)
  const confidence: PollConfidence = highConfidence ? 'HIGH' : 'LOW'

  await prisma.poll.update({
    where: { id: pollId },
    data: {
      isCompleted: true,
      confidence,
      responseCount: totalResponses,
      completedDate: new Date(),
    },
  })
  console.log(
    `Poll marked as COMPLETED (${totalResponses} responses, confidence: ${confidence})`,
  )
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
