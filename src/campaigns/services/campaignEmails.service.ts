import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { Campaign, Prisma, User } from '@prisma/client'
import { DAY_OF_WEEK, findPreviousWeekDay } from '../../shared/util/date.util'
import { getUserFullName } from '../../users/util/users.util'
import { subDays, subWeeks } from 'date-fns'
import {
  EmailTemplateName,
  ScheduledMessageTypes,
} from '../../email/email.types'
import { ScheduledMessagingService } from '../../scheduled-messaging/scheduled-messaging.service'
import { UsersService } from '../../users/services/users.service'
import { WEBAPP_ROOT } from '../../shared/util/appEnvironment.util'
import { EmailService } from '../../email/email.service'
import { Timeout } from '@nestjs/schedule'
import { PrismaService } from 'src/prisma/prisma.service'

type CountdownEmailConfig = {
  template: EmailTemplateName
  week?: number
  daysBeforeElection?: number
}
export const WEEKLY_COUNTDOWN_EMAIL_CONFIGS: CountdownEmailConfig[] = [
  {
    week: 1,
    template: EmailTemplateName.campaignCountdownWeek1,
  },
  {
    week: 2,
    template: EmailTemplateName.campaignCountdownWeek2,
  },
  {
    week: 3,
    template: EmailTemplateName.campaignCountdownWeek3,
  },
  {
    week: 4,
    template: EmailTemplateName.campaignCountdownWeek4,
  },
  {
    week: 5,
    template: EmailTemplateName.campaignCountdownWeek5,
  },
  {
    week: 6,
    template: EmailTemplateName.campaignCountdownWeek6,
  },
  {
    week: 7,
    template: EmailTemplateName.campaignCountdownWeek7,
  },
  {
    week: 8,
    template: EmailTemplateName.campaignCountdownWeek8,
  },
]

@Injectable()
export class CampaignEmailsService {
  private readonly logger = new Logger(CampaignEmailsService.name)
  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly scheduledMessaging: ScheduledMessagingService,
    private readonly emailService: EmailService,
    private readonly prismaService: PrismaService,
  ) {}

  @Timeout(0)
  async backfillCampaignCountdownEmails() {
    const campaigns = await this.fetchCampaignsWithMissingCountdownEmails()
    if (!campaigns.length) {
      this.logger.debug(
        'No active campaigns found with missing countdown emails',
      )
      return
    }

    this.logger.warn(
      `Found active campaigns w/ missing countdown emails.  Scheduling countdown emails for the following campaign ids => ${campaigns
        .map((c) => c.id)
        .join(', ')}`,
    )

    for (const campaign of campaigns) {
      this.logger.debug(
        `Scheduling countdown emails for campaign ${campaign.id}...`,
      )
      await this.scheduleCampaignCountdownEmails(campaign)
    }
  }

  private async fetchCampaignsWithMissingCountdownEmails() {
    // TODO: consolidate this into a single query once we don't have to drop to
    //  raw query to do the `electionDate` comparison
    const campaignIds: { id: number }[] = await this.prismaService
      .$queryRaw(Prisma.sql`
      SELECT c.id
      FROM campaign c
      WHERE c.details ->> 'electionDate' IS NOT NULL
        and c.details ->> 'electionDate' ~ '^\\d{4}-\\d{2}-\\d{2}$'
        and NULLIF(c.details ->> 'electionDate', '') IS NOT NULL
        and TO_DATE(c.details ->> 'electionDate', 'YYYY-MM-DD') > CURRENT_DATE
        and c.is_active = true
    `)
    if (!campaignIds.length) {
      return []
    }

    // We need to query again to get the full campaign details in the proper Prisma model format
    const campaigns = await this.prismaService.campaign.findMany({
      where: {
        id: {
          in: campaignIds.map((row) => row.id),
        },
      },
    })

    const campaignsWithMissingEmails: Campaign[] = []
    for (const c of campaigns) {
      const scheduledMessages = await this.scheduledMessaging.findMany({
        where: {
          campaignId: c.id,
        },
      })
      if (scheduledMessages.length === 0) {
        campaignsWithMissingEmails.push(c)
      }
    }
    return campaignsWithMissingEmails
  }

  async sendCampaignLaunchEmail(user: User) {
    try {
      await this.emailService.sendTemplateEmail({
        to: user.email,
        subject: 'Full Suite of AI Campaign Tools Now Available',
        template: EmailTemplateName.campaignLaunch,
        variables: {
          name: getUserFullName(user),
          link: `${WEBAPP_ROOT}/dashboard`,
        },
      })
    } catch (e) {
      this.logger.error('Error sending campaign launch email', e)
    }
  }

  async scheduleCampaignCountdownEmails(campaign: Campaign) {
    if (!campaign.details?.electionDate) {
      this.logger.error(
        'Cannot schedule countdown emails: no election date found',
        {
          campaignId: campaign.id,
        },
      )
      return
    }

    const user = (await this.usersService.findUnique({
      where: { id: campaign.userId },
    }))!

    const electionDate = new Date(campaign.details.electionDate)
    const weekBeforeElection = findPreviousWeekDay(
      electionDate,
      DAY_OF_WEEK.MONDAY,
    )
    const firstName = user.firstName || getUserFullName(user).split(' ')[0]

    for (const config of [...WEEKLY_COUNTDOWN_EMAIL_CONFIGS]) {
      const sendDate: Date = config.week
        ? subWeeks(weekBeforeElection, config.week - 1)
        : subDays(electionDate, config.daysBeforeElection!)

      if (sendDate < new Date()) {
        this.logger.debug(`Skipping email as the send date is in the past`, {
          campaignId: campaign.id,
          sendDate,
          config,
        })
        continue
      }

      const emailConfig: PrismaJson.ScheduledMessageConfig = {
        type: ScheduledMessageTypes.EMAIL,
        message: {
          to: user.email,
          template: config.template,
          variables: { firstName },
        },
      }

      this.scheduledMessaging.scheduleMessage(
        campaign.id,
        emailConfig,
        sendDate,
      )
    }
  }
}
