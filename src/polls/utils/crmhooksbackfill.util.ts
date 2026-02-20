import { CampaignWithPathToVictory } from '@/campaigns/campaigns.types'
import { CampaignsService } from '@/campaigns/services/campaigns.service'
import { ContactsService } from '@/contacts/services/contacts.service'
import { normalizePhoneNumber } from '@/shared/util/strings.util'
import { S3 } from '@aws-sdk/client-s3'
import { Logger } from '@nestjs/common'
import {
  Prisma,
  PollIndividualMessageSender,
  PollIssue,
  PrismaClient,
} from '@prisma/client'
import { isNotNil, uniq } from 'es-toolkit'
import pMap from 'p-map'
import z from 'zod'
import { v5 as uuidv5 } from 'uuid'
import { POLL_INDIVIDUAL_MESSAGE_NAMESPACE } from './polls.utils'

const s3 = new S3()

const backfillPhoneNumbers = async (
  logger: Logger,
  prisma: PrismaClient,
  campaign: CampaignWithPathToVictory,
  pollId: string,
  contacts: ContactsService,
) => {
  const messages = await prisma.pollIndividualMessage.findMany({
    where: { pollId },
  })

  if (!messages.length) {
    return
  }

  // Fetch phone numbers in parallel
  const messagesWithPhones = await pMap(
    messages,
    async (msg) => ({
      messageId: msg.id,
      person: await contacts.findPerson(msg.personId, campaign),
    }),
    { concurrency: 20 },
  )

  await prisma.$transaction(async (tx) => {
    for (const { messageId, person } of messagesWithPhones) {
      if (!person.cellPhone) {
        continue
      }
      await tx.pollIndividualMessage.update({
        where: { id: messageId },
        data: { personCellPhone: normalizePhoneNumber(person.cellPhone) },
      })
    }
  })

  logger.log(
    `Backfilled ${messagesWithPhones.length} phone numbers for poll ${pollId}`,
  )
}

const downloadObject = async (bucket: string, key: string) => {
  const obj = await s3.getObject({ Bucket: bucket, Key: key })
  if (!obj.Body) {
    throw new Error(`S3 object ${key} has no body`)
  }
  return obj.Body.transformToString()
}

const findJsonOutputKey = async (pollId: string, issues: PollIssue[]) => {
  // Gather all historical response CSVs from serve-data-analyze output bucket folder
  const outputs = await s3.listObjectsV2({
    Bucket: process.env.SERVE_ANALYSIS_BUCKET_NAME,
    Prefix: `output/${pollId}`,
  })

  if (!outputs.Contents?.length) {
    return null
  }
  const extractTimestamp = (key: string) => {
    const parts = key.split('/')
    if (parts.length < 3) {
      throw new Error(`Unexpected S3 key format: ${key}`)
    }
    return parts[2]
  }

  const keys = outputs.Contents.map((c) => c.Key!)

  const clusterOutputs = keys.filter((key) =>
    key.includes('all_cluster_analysis.json'),
  )

  if (!clusterOutputs.length) {
    return null
  }

  if (clusterOutputs.length === 1) {
    return clusterOutputs[0]
  }

  if (!issues.length) {
    return null
  }

  for (const clusterOutput of clusterOutputs) {
    const eventOutput = keys.find(
      (k) =>
        k.includes(extractTimestamp(clusterOutput)) &&
        k.includes('.json') &&
        k.includes('events'),
    )

    if (!eventOutput) {
      continue
    }
    const jsonContent = await downloadObject(
      process.env.SERVE_ANALYSIS_BUCKET_NAME!,
      eventOutput,
    )
    if (issues.every((issue) => jsonContent.includes(issue.title))) {
      return clusterOutput
    }
  }

  throw new Error('No matching JSON output key found')
}

const atomizedMessageSchema = z.object({
  phoneNumber: z.string(),
  receivedAt: z.string(),
  originalMessage: z.string(),
  pollId: z.string(),
  theme: z.string(),
  isOptOut: z.boolean(),
})

const getAtomizedMessages = async (pollId: string, issues: PollIssue[]) => {
  const jsonOutputKey = await findJsonOutputKey(pollId, issues)

  if (!jsonOutputKey) {
    return null
  }

  const obj = await downloadObject(
    process.env.SERVE_ANALYSIS_BUCKET_NAME!,
    jsonOutputKey,
  )

  return z.array(atomizedMessageSchema).parse(JSON.parse(obj))
}

export const backfillPollCRMHooksData = async (
  prisma: PrismaClient,
  logger: Logger,
  pollId: string,
  campaignsService: CampaignsService,
  contactsService: ContactsService,
) => {
  logger.log(
    `[CRM Hooks Backfill] Backfilling CRM hooks data for poll ${pollId}`,
  )
  const poll = await prisma.poll.findUniqueOrThrow({
    where: { id: pollId },
    include: { electedOffice: true },
  })
  if (!poll.electedOffice) {
    return
  }

  const issues = await prisma.pollIssue.findMany({
    where: {
      pollId: poll.id,
    },
  })

  // 1. Backfill elected office on all messages
  await prisma.pollIndividualMessage.updateMany({
    where: {
      pollId: poll.id,
    },
    data: {
      electedOfficeId: poll.electedOfficeId,
    },
  })

  // 2. Backfill phone numbers on all messages, via people-api
  const campaign = await campaignsService.findFirstOrThrow({
    where: { id: poll.electedOffice.campaignId },
    include: { pathToVictory: true },
  })
  await backfillPhoneNumbers(logger, prisma, campaign, poll.id, contactsService)

  // 3. Fetch the atomized response JSON blobs from S3
  const atomizedMessages = await getAtomizedMessages(poll.id, issues)
  if (!atomizedMessages) {
    return
  }

  // 4. Backfill messages from the atomized responses
  const existingMessages = await prisma.pollIndividualMessage.findMany({
    where: {
      pollId: poll.id,
      sender: PollIndividualMessageSender.CONSTITUENT,
    },
  })

  const reducedMessages: Prisma.PollIndividualMessageUncheckedCreateInput[] =
    uniq(atomizedMessages.map((m) => m.phoneNumber))
      .map((phoneNumber) => {
        const allAtomizedMessagesForPhoneNumber = atomizedMessages.filter(
          (m) => m.phoneNumber === phoneNumber,
        )
        const first = allAtomizedMessagesForPhoneNumber[0]

        const messageIssues = issues.filter((i) =>
          allAtomizedMessagesForPhoneNumber.some((m) => m.theme === i.title),
        )

        const personId = existingMessages.find(
          (m) =>
            m.personCellPhone &&
            normalizePhoneNumber(m.personCellPhone) ===
              normalizePhoneNumber(first.phoneNumber),
        )?.personId

        if (!personId) {
          return null
        }

        return {
          id: uuidv5(
            `${pollId}-${personId}-${first.receivedAt}`,
            POLL_INDIVIDUAL_MESSAGE_NAMESPACE,
          ),
          pollId: poll.id,
          personId: personId,
          electedOfficeId: poll.electedOfficeId,
          personCellPhone: normalizePhoneNumber(first.phoneNumber),
          sender: PollIndividualMessageSender.CONSTITUENT,
          content: first.originalMessage,
          sentAt: new Date(first.receivedAt),
          isOptOut: first.isOptOut,
          pollIssues: {
            connect: messageIssues.map((i) => ({
              id: i.id,
            })),
          },
        } satisfies Prisma.PollIndividualMessageUncheckedCreateInput
      })
      .filter(isNotNil)

  await prisma.$transaction(async (tx) => {
    for (const message of reducedMessages) {
      if (!message.personCellPhone) {
        continue
      }

      const { pollIssues, ...messageData } = message
      await tx.pollIndividualMessage.upsert({
        where: { id: message.id },
        create: message,
        update: {
          ...messageData,
          pollIssues: { set: pollIssues?.connect },
        },
      })
    }
  })

  logger.log(
    `[CRM Hooks Backfill] Backfilled CRM hooks data for poll ${pollId}. Messages backfilled: ${reducedMessages.length}`,
  )
}
