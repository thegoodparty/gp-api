import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { Campaign, User } from '@prisma/client'
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
export const DAILY_COUNTDOWN_EMAIL_CONFIGS: CountdownEmailConfig[] = [
  {
    daysBeforeElection: 5,
    template: EmailTemplateName.campaignCountdown5Days,
  },
  {
    daysBeforeElection: 4,
    template: EmailTemplateName.campaignCountdown4Days,
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
  ) {}

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

    for (const config of [
      ...WEEKLY_COUNTDOWN_EMAIL_CONFIGS,
      // ...DAILY_COUNTDOWN_EMAIL_CONFIGS, // TODO: Uncomment this when ready to send daily countdown emails
    ]) {
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
