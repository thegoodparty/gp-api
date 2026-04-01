import { Logger } from '@nestjs/common'
import parseCsv from 'neat-csv'
import { PollIndividualMessage } from '@prisma/client'
import { sendTevynAPIPollMessage } from '@/polls/utils/polls.utils'
import { format, isBefore } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { PollExecutionService } from '@/polls/services/pollExecution.service'

const logger = new Logger('PollActivities')

let pollExecutionService: PollExecutionService

export const setPollExecutionService = (service: PollExecutionService) => {
  pollExecutionService = service
}

export const getOrCreateCsv = async (pollId: string): Promise<string> => {
  const data = await pollExecutionService.getPollAndCampaign(pollId)
  if (!data) {
    logger.log(`${pollId} Poll not found`)
    return ''
  }
  const { poll, campaign } = data

  const bucket = process.env.TEVYN_POLL_CSVS_BUCKET
  if (!bucket) {
    throw new Error(
      `${pollId} TEVYN_POLL_CSVS_BUCKET environment variable is required`,
    )
  }
  const fileName = `${poll.id}-${poll.estimatedCompletionDate.toISOString()}.csv`
  const key = pollExecutionService.s3Service.buildKey(undefined, fileName)

  let csv = await pollExecutionService.s3Service.getFile(bucket, key)

  if (!csv) {
    logger.log(`${pollId} No existing CSV found, generating new one`)
    const sample = await pollExecutionService.contactsService.sampleContacts(
      { size: poll.targetAudienceSize },
      campaign,
    )
    logger.log(`${pollId} Generated sample of ${sample.length} contacts`)
    csv = pollExecutionService.buildCsvFromContacts(sample)
    await pollExecutionService.s3Service.uploadFile(bucket, csv, key, {
      contentType: 'text/csv',
    })
  }

  return csv
}

export const createPollMessages = async (
  pollId: string,
  csv: string,
): Promise<void> => {
  const people = await parseCsv<{ id: string }>(csv)
  const now = new Date()

  await pollExecutionService.pollsService.client.$transaction(
    async (tx) => {
      for (const person of people) {
        const message: PollIndividualMessage = {
          id: `${pollId}-${person.id}`,
          pollId,
          personId: person.id!,
          sentAt: now,
        }
        await tx.pollIndividualMessage.upsert({
          where: { id: message.id },
          create: message,
          update: message,
        })
      }
    },
    { timeout: 10000 },
  )

  logger.log(`${pollId} Created individual poll messages`)
}

export const sendSlackNotification = async (
  pollId: string,
  csv: string,
  isExpansion: boolean,
): Promise<void> => {
  const data = await pollExecutionService.getPollAndCampaign(pollId)
  if (!data) return
  const { poll, campaign } = data

  const user = await pollExecutionService.usersService.findUnique({
    where: { id: campaign.userId },
  })
  if (!user) return

  await sendTevynAPIPollMessage(pollExecutionService.slackService.client, {
    message: poll.messageContent,
    pollId: poll.id,
    scheduledDate: isBefore(poll.scheduledDate, new Date())
      ? 'Now'
      : formatInTimeZone(poll.scheduledDate, 'America/New_York', 'PP p') +
        ' ET',
    csv: {
      fileContent: Buffer.from(csv),
      filename: `${user.email}-${format(poll.scheduledDate, 'yyyy-MM-dd')}.csv`,
    },
    imageUrl: poll.imageUrl || undefined,
    userInfo: {
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      email: user.email,
      phone: user.phone || undefined,
    },
    isExpansion,
  })

  logger.log(`${pollId} Slack message sent`)
}

export const executePollExpansion = async (
  pollId: string,
): Promise<boolean> => {
  return pollExecutionService.executePollExpansion(pollId)
}
