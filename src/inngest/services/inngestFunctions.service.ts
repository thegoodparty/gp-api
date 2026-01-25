import { Injectable, Logger } from '@nestjs/common'
import { InngestFunction } from 'inngest'
import { inngest } from '../inngest.client'
import { PollExecutionService } from 'src/polls/services/pollExecution.service'
import parseCsv from 'neat-csv'
import { PollIndividualMessage } from '@prisma/client'
import { sendTevynAPIPollMessage } from '@/polls/utils/polls.utils'
import { format, isBefore } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

@Injectable()
export class InngestFunctionsService {
  private readonly logger = new Logger(InngestFunctionsService.name)

  constructor(private readonly pollExecutionService: PollExecutionService) {}

  getFunctions(): InngestFunction.Any[] {
    return [
      this.createPollCreationFunction(),
      this.createPollExpansionFunction(),
    ]
  }

  private createPollCreationFunction() {
    return inngest.createFunction(
      {
        id: 'poll-creation',
        name: 'Poll Creation',
        retries: 3,
      },
      { event: 'polls/creation.requested' },
      async ({ event, step }) => {
        const { pollId } = event.data

        this.logger.log(`Processing poll creation for pollId: ${pollId}`)

        const data = await this.pollExecutionService.getPollAndCampaign(pollId)
        if (!data) {
          this.logger.log(`${pollId} Poll not found, ignoring event`)
          return { success: true, pollId }
        }
        const { poll, campaign } = data

        const user = await this.pollExecutionService.usersService.findUnique({
          where: { id: campaign.userId },
        })
        this.logger.log(`${pollId} Fetched sample and user`)

        if (!user) {
          this.logger.log(`${pollId} User not found, ignoring event`)
          return { success: true, pollId }
        }

        const bucket = process.env.TEVYN_POLL_CSVS_BUCKET
        if (!bucket) {
          throw new Error(
            `${pollId} TEVYN_POLL_CSVS_BUCKET environment variable is required`,
          )
        }
        const fileName = `${poll.id}-${poll.estimatedCompletionDate.toISOString()}.csv`
        const key = this.pollExecutionService.s3Service.buildKey(
          undefined,
          fileName,
        )

        const csv = await step.run('get-or-create-csv', async () => {
          let _csv = await this.pollExecutionService.s3Service.getFile(
            bucket,
            key,
          )

          if (!_csv) {
            this.logger.log(
              `${pollId} No existing CSV found, generating new one`,
            )
            const sample =
              await this.pollExecutionService.contactsService.sampleContacts(
                { size: poll.targetAudienceSize },
                campaign,
              )
            this.logger.log(
              `${pollId} Generated sample of ${sample.length} contacts`,
            )
            _csv = this.pollExecutionService.buildCsvFromContacts(sample)
            await this.pollExecutionService.s3Service.uploadFile(
              bucket,
              _csv,
              key,
              {
                contentType: 'text/csv',
              },
            )
          }

          return _csv
        })

        await step.run('parse-csv-and-create-messages', async () => {
          const people = await parseCsv<{ id: string }>(csv)

          const now = new Date()
          await this.pollExecutionService.pollsService.client.$transaction(
            async (tx) => {
              for (const person of people) {
                const message: PollIndividualMessage = {
                  id: `${poll.id}-${person.id}`,
                  pollId: poll.id,
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

          this.logger.log(`${pollId} Created individual poll messages`)
        })

        await step.run('send-slack-message', async () => {
          await sendTevynAPIPollMessage(
            this.pollExecutionService.slackService.client,
            {
              message: poll.messageContent,
              pollId: poll.id,
              scheduledDate: isBefore(poll.scheduledDate, new Date())
                ? 'Now'
                : formatInTimeZone(
                    poll.scheduledDate,
                    'America/New_York',
                    'PP p',
                  ) + ' ET',
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
              isExpansion: false,
            },
          )
          this.logger.log(`${pollId} Slack message sent`)
        })

        return { success: true, pollId }
      },
    )
  }

  private createPollExpansionFunction() {
    return inngest.createFunction(
      {
        id: 'poll-expansion',
        name: 'Poll Expansion',
        retries: 3,
      },
      { event: 'polls/expansion.requested' },
      async ({ event, step }) => {
        const { pollId } = event.data

        this.logger.log(`Processing poll expansion for pollId: ${pollId}`)

        await step.run('execute-poll-expansion', async () => {
          return this.pollExecutionService.executePollExpansion(pollId)
        })

        return { success: true, pollId }
      },
    )
  }
}
