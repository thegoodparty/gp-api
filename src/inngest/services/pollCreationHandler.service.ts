import { Injectable, Logger } from '@nestjs/common'
import {
  Campaign,
  PathToVictory,
  Poll,
  PollIndividualMessage,
} from '@prisma/client'
import { isBefore, format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import parseCsv from 'neat-csv'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { PersonOutput } from 'src/contacts/schemas/person.schema'
import { ContactsService } from 'src/contacts/services/contacts.service'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import { PollsService } from 'src/polls/services/polls.service'
import { sendTevynAPIPollMessage } from 'src/polls/utils/polls.utils'
import { UsersService } from 'src/users/services/users.service'
import { S3Service } from 'src/vendors/aws/services/s3.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { PollCreationData } from '../inngest.client'

type CampaignWithPathToVictory = Campaign & {
  pathToVictory: PathToVictory | null
}

@Injectable()
export class PollCreationHandlerService {
  private readonly logger = new Logger(PollCreationHandlerService.name)

  constructor(
    private readonly pollsService: PollsService,
    private readonly campaignsService: CampaignsService,
    private readonly electedOfficeService: ElectedOfficeService,
    private readonly contactsService: ContactsService,
    private readonly usersService: UsersService,
    private readonly s3Service: S3Service,
    private readonly slackService: SlackService,
  ) {}

  async handlePollCreation(data: PollCreationData) {
    this.logger.log(`Handling poll creation event for poll ${data.pollId}`)

    const pollData = await this.getPollAndCampaign(data.pollId)
    if (!pollData) {
      this.logger.log('Poll or campaign not found, ignoring event')
      return
    }
    const { poll, campaign } = pollData

    const user = await this.usersService.findUnique({
      where: { id: campaign.userId },
    })
    this.logger.log(`${data.pollId} Fetched poll and user`)

    if (!user) {
      this.logger.log(`${data.pollId} User not found, ignoring event`)
      return
    }

    const bucket = process.env.TEVYN_POLL_CSVS_BUCKET
    if (!bucket) {
      throw new Error(
        `${data.pollId} TEVYN_POLL_CSVS_BUCKET environment variable is required`,
      )
    }

    const fileName = `${poll.id}-${poll.estimatedCompletionDate.toISOString()}.csv`
    const key = this.s3Service.buildKey(undefined, fileName)

    let csv = await this.s3Service.getFile(bucket, key)

    if (!csv) {
      this.logger.log(
        `${data.pollId} No existing CSV found, generating new one`,
      )
      const sampleParams = { size: poll.targetAudienceSize }
      this.logger.log(
        `${poll.id} Sampling contacts with params: ${JSON.stringify(sampleParams)}`,
      )
      const sample = await this.contactsService.sampleContacts(
        sampleParams,
        campaign,
      )
      this.logger.log(
        `${data.pollId} Generated sample of ${sample.length} contacts`,
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

    this.logger.log(`${data.pollId} Created individual poll messages`)

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
      isExpansion: false,
    })

    this.logger.log(`${data.pollId} Slack message sent to Tevyn`)
  }

  private async getPollAndCampaign(
    pollId: string,
  ): Promise<{ poll: Poll; campaign: CampaignWithPathToVictory } | null> {
    const poll = await this.pollsService.findUnique({
      where: { id: pollId },
    })
    if (!poll) {
      this.logger.log('Poll not found, ignoring event')
      return null
    }

    if (!poll.electedOfficeId) {
      this.logger.log('Poll has no elected office, ignoring event')
      return null
    }

    const office = await this.electedOfficeService.findUnique({
      where: { id: poll.electedOfficeId },
    })

    if (!office) {
      this.logger.log('Elected office not found, ignoring event')
      return null
    }

    const campaign = (await this.campaignsService.findUnique({
      where: { id: office.campaignId },
      include: { pathToVictory: true },
    })) as CampaignWithPathToVictory | null

    if (!campaign) {
      this.logger.log('No campaign found, ignoring event')
      return null
    }

    return { poll, campaign }
  }

  private csvEscape(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return ''
    const str = String(value)
    const mustQuote = /[",\n]/.test(str)
    const escaped = str.replace(/"/g, '""')
    return mustQuote ? `"${escaped}"` : escaped
  }

  private buildCsvFromContacts(people: PersonOutput[]): string {
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
