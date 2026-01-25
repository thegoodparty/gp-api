import { Injectable, Logger } from '@nestjs/common'
import {
  Campaign,
  PathToVictory,
  Poll,
  PollIndividualMessage,
} from '@prisma/client'
import { format, isBefore } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import parseCsv from 'neat-csv'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { PersonOutput } from 'src/contacts/schemas/person.schema'
import { SampleContacts } from 'src/contacts/schemas/sampleContacts.schema'
import { ContactsService } from 'src/contacts/services/contacts.service'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import { UsersService } from 'src/users/services/users.service'
import { S3Service } from 'src/vendors/aws/services/s3.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { sendTevynAPIPollMessage } from '../utils/polls.utils'
import { PollsService } from './polls.service'

export type TriggerPollExecutionParams = {
  pollId: string
  sampleParams: (poll: Poll) => Promise<SampleContacts> | SampleContacts
  isExpansion: boolean
}

type PollWithCampaign = {
  poll: Poll
  office: { id: string; campaignId: number }
  campaign: Campaign & { pathToVictory: PathToVictory | null }
}

@Injectable()
export class PollExecutionService {
  private readonly logger = new Logger(PollExecutionService.name)

  constructor(
    readonly pollsService: PollsService,
    readonly campaignsService: CampaignsService,
    readonly electedOfficeService: ElectedOfficeService,
    readonly contactsService: ContactsService,
    readonly s3Service: S3Service,
    readonly slackService: SlackService,
    readonly usersService: UsersService,
  ) {}

  async triggerPollExecution(
    params: TriggerPollExecutionParams,
  ): Promise<boolean> {
    const data = await this.getPollAndCampaign(params.pollId)
    if (!data) {
      this.logger.log(`${params.pollId} Poll not found, ignoring event`)
      return true
    }
    const { poll, campaign } = data

    const user = await this.usersService.findUnique({
      where: { id: campaign.userId },
    })
    this.logger.log(`${params.pollId} Fetched sample and user`)

    if (!user) {
      this.logger.log(`${params.pollId} User not found, ignoring event`)
      return true
    }

    const bucket = process.env.TEVYN_POLL_CSVS_BUCKET
    if (!bucket) {
      throw new Error(
        `${params.pollId} TEVYN_POLL_CSVS_BUCKET environment variable is required`,
      )
    }
    const fileName = `${poll.id}-${poll.estimatedCompletionDate.toISOString()}.csv`
    const key = this.s3Service.buildKey(undefined, fileName)

    let csv = await this.s3Service.getFile(bucket, key)

    if (!csv) {
      this.logger.log(
        `${params.pollId} No existing CSV found, generating new one`,
      )
      const sampleParams = await params.sampleParams(poll)
      this.logger.log(
        `${poll.id} Sampling contacts with params: ${JSON.stringify(sampleParams)}`,
      )
      const sample = await this.contactsService.sampleContacts(
        sampleParams,
        campaign,
      )
      this.logger.log(
        `${params.pollId} Generated sample of ${sample.length} contacts`,
      )
      csv = this.buildCsvFromContacts(sample)
      await this.s3Service.uploadFile(bucket, csv, key, {
        contentType: 'text/csv',
      })
    }

    const people = await parseCsv<{ id: string }>(csv)

    const now = new Date()
    await this.pollsService.client.$transaction(
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

    this.logger.log(`${params.pollId} Created individual poll messages`)

    await sendTevynAPIPollMessage(this.slackService.client, {
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
      isExpansion: params.isExpansion,
    })
    this.logger.log(`${params.pollId} Slack message sent`)

    return true
  }

  async executePollCreation(pollId: string): Promise<boolean> {
    return this.triggerPollExecution({
      pollId,
      sampleParams: async (poll) => {
        return { size: poll.targetAudienceSize }
      },
      isExpansion: false,
    })
  }

  async executePollExpansion(pollId: string): Promise<boolean> {
    return this.triggerPollExecution({
      pollId,
      sampleParams: async (poll) => {
        const alreadySent =
          await this.pollsService.client.pollIndividualMessage.findMany({
            where: { pollId: poll.id },
            select: { personId: true },
          })

        return {
          size: poll.targetAudienceSize - alreadySent.length,
          excludeIds: alreadySent.map((p) => p.personId),
        }
      },
      isExpansion: true,
    })
  }

  async getPollAndCampaign(
    pollId: string,
  ): Promise<PollWithCampaign | undefined> {
    const poll = await this.pollsService.findUnique({
      where: { id: pollId },
    })
    if (!poll) {
      this.logger.log('Poll not found, ignoring event')
      return
    }

    if (!poll.electedOfficeId) {
      this.logger.log('Poll has no elected office, ignoring event')
      return
    }

    const office = await this.electedOfficeService.findUnique({
      where: { id: poll.electedOfficeId },
    })

    if (!office) {
      this.logger.log('Elected office not found, ignoring event')
      return
    }

    const campaign = await this.campaignsService.findUnique({
      where: { id: office.campaignId },
      include: { pathToVictory: true },
    })

    if (!campaign) {
      this.logger.log('No campaign found, ignoring event')
      return
    }
    return { poll, office, campaign }
  }

  csvEscape(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return ''
    const str = String(value)
    const mustQuote = /[",\n]/.test(str)
    const escaped = str.replace(/"/g, '""')
    return mustQuote ? `"${escaped}"` : escaped
  }

  buildCsvFromContacts(people: PersonOutput[]): string {
    const headers: (keyof PersonOutput)[] = [
      'id',
      'firstName',
      'lastName',
      'cellPhone',
    ]
    const lines = [headers.join(',')]
    for (const person of people) {
      const row = headers.map((key) => this.csvEscape(person?.[key] ?? ''))
      lines.push(row.join(','))
    }
    return lines.join('\n')
  }
}
