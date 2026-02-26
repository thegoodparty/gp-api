import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { AdminCreateCampaignSchema } from './schemas/adminCreateCampaign.schema'
import { AdminUpdateCampaignSchema } from './schemas/adminUpdateCampaign.schema'
import { Campaign, Prisma } from '@prisma/client'
import { EmailService } from 'src/email/email.service'
import { getUserFullName } from 'src/users/util/users.util'
import { EmailTemplateName } from 'src/email/email.types'
import { UsersService } from 'src/users/services/users.service'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { AdminP2VService } from '../services/adminP2V.service'
import { CampaignCreatedBy, OnboardingStep } from '@goodparty_org/contracts'
import { CampaignWith } from 'src/campaigns/campaigns.types'
import { WEBAPP_ROOT } from 'src/shared/util/appEnvironment.util'
import { formatDate } from 'date-fns'
import { P2VStatus } from 'src/elections/types/pathToVictory.types'
import { DateFormats } from 'src/shared/util/date.util'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { VoterFileDownloadAccessService } from '../../shared/services/voterFileDownloadAccess.service'
import { AuthenticationService } from 'src/authentication/authentication.service'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { AnalyticsService } from 'src/analytics/analytics.service'

@Injectable()
export class AdminCampaignsService {
  private readonly logger = new Logger(AdminCampaignsService.name)

  constructor(
    private readonly email: EmailService,
    private readonly users: UsersService,
    private readonly campaigns: CampaignsService,
    private readonly adminP2V: AdminP2VService,
    private readonly voterFileDownloadAccess: VoterFileDownloadAccessService,
    private readonly crm: CrmCampaignsService,
    private readonly auth: AuthenticationService,
    private readonly analytics: AnalyticsService,
  ) {}

  async create(body: AdminCreateCampaignSchema) {
    const {
      firstName,
      lastName,
      email,
      zip,
      phone,
      party,
      otherParty,
      adminUserEmail,
    } = body

    // create new user
    const user = await this.users.createUser({
      firstName,
      lastName,
      email,
      zip,
      phone,
    })

    const resetToken = this.auth.generatePasswordResetToken()
    const updatedUser = await this.users.setResetToken(user.id, resetToken)
    this.email.sendSetPasswordEmail(updatedUser)
    this.analytics.track(user.id, EVENTS.Onboarding.UserCreated)

    // find slug
    const slug = await this.campaigns.findSlug(user)
    const data = {
      slug,
      currentStep: OnboardingStep.complete,
      party,
      otherParty,
      createdBy: CampaignCreatedBy.ADMIN,
      adminUserEmail,
    }

    // create new campaign
    const newCampaign = await this.campaigns.create({
      data: {
        slug,
        data,
        isActive: true,
        userId: user.id,
        details: {
          zip: user.zip,
          knowRun: 'yes',
          pledged: true,
        },
      },
    })

    await this.crm.trackCampaign(newCampaign.id)

    return newCampaign
  }

  async update(id: number, body: AdminUpdateCampaignSchema) {
    const { isVerified, isPro, didWin, tier } = body
    const attributes: Prisma.CampaignUpdateInput = {}

    if (typeof isVerified !== 'undefined') {
      attributes.isVerified = isVerified
      attributes.dateVerified = isVerified === null ? null : new Date()
    }
    if (typeof isPro !== 'undefined') {
      attributes.isPro = isPro
    }
    if (typeof didWin !== 'undefined') {
      attributes.didWin = didWin
    }
    if (typeof tier !== 'undefined') {
      attributes.tier = tier
    }

    const updatedCampaign = await this.campaigns.update({
      where: { id },
      data: attributes,
    })
    if (isPro === true) {
      try {
        await this.analytics.track(
          updatedCampaign?.userId,
          EVENTS.Account.ProSubscriptionConfirmed,
          {
            price: 0,
            paymentMethod: 'admin',
          },
        )
      } catch (error) {
        this.logger.error(
          `[ADMIN] Failed to track admin pro subscription analytics - User: ${updatedCampaign?.userId}, Campaign: ${id}`,
          error,
        )
        // Don't throw - we don't want to fail the admin operation for analytics issues
      }
    }
    await this.crm.trackCampaign(updatedCampaign.id)

    return updatedCampaign
  }

  async proNoVoterFile() {
    const campaigns = (await this.campaigns.findMany({
      where: {
        NOT: {
          userId: undefined,
        },
        isPro: true,
      },
      include: {
        pathToVictory: true,
      },
    })) as CampaignWith<'pathToVictory'>[]

    const noVoterFile: Campaign[] = []

    // TODO: this check could probably be integrated into the above query
    for (const campaign of campaigns) {
      const canDownload = this.voterFileDownloadAccess.canDownload(
        campaign as CampaignWith<'pathToVictory'>,
      )
      if (!canDownload) {
        noVoterFile.push(campaign)
      }
    }

    return noVoterFile
  }

  async p2vStats() {
    // get todays date in format yyyy-mm-dd
    const date = formatDate(new Date(), DateFormats.isoDate)

    const [auto, manual, pending] = await Promise.all([
      this.getAutoP2V(date),
      this.getManualP2V(date),
      this.getPendingP2V(date),
    ])

    return {
      auto,
      manual,
      pending,
      total: auto + manual + pending,
    }
  }

  async sendVictoryEmail(id: number) {
    const campaign = (await this.campaigns.findFirstOrThrow({
      where: { id },
      include: { user: true, pathToVictory: true },
    })) as CampaignWith<'pathToVictory' | 'user'>

    const { pathToVictory, user } = campaign

    if (!pathToVictory) {
      throw new BadRequestException('Path to Victory is not set.')
    }
    if (!user) {
      throw new BadRequestException('Campaign has no user')
    }

    await this.adminP2V.completeP2V(user.id, pathToVictory)

    if (campaign?.data?.createdBy !== CampaignCreatedBy.ADMIN) {
      const variables = {
        name: getUserFullName(user),
        link: `${WEBAPP_ROOT}/dashboard`,
      }

      await this.email.sendTemplateEmail({
        to: user.email,
        subject: 'Exciting News: Your Customized Campaign Plan is Updated!',
        template: EmailTemplateName.candidateVictoryReady,
        variables,
        from: 'jared@goodparty.org',
      })
    }

    return true
  }

  private async getAutoP2V(electionDate: string) {
    return this.campaigns.count({
      where: {
        AND: [
          {
            details: {
              path: ['electionDate'],
              gt: electionDate,
            },
          },
          {
            details: {
              path: ['raceId'],
              not: Prisma.AnyNull,
            },
          },
          {
            pathToVictory: {
              data: {
                path: ['p2vStatus'],
                equals: P2VStatus.complete,
              },
            },
          },
          {
            pathToVictory: {
              data: {
                path: ['p2vNotNeeded'],
                equals: Prisma.AnyNull,
              },
            },
          },
          {
            pathToVictory: {
              data: {
                path: ['electionType'],
                not: Prisma.AnyNull,
              },
            },
          },
        ],
      },
    })
  }

  private async getManualP2V(electionDate: string) {
    // TODO: switch to checking for data->>'completedBy' IS NULL (comment copied from tgp-api)
    return this.campaigns.count({
      where: {
        AND: [
          {
            details: {
              path: ['electionDate'],
              gt: electionDate,
            },
          },
          {
            pathToVictory: {
              data: {
                path: ['p2vStatus'],
                equals: P2VStatus.complete,
              },
            },
          },
          {
            pathToVictory: {
              data: {
                path: ['p2vNotNeeded'],
                equals: Prisma.AnyNull,
              },
            },
          },
          {
            pathToVictory: {
              data: {
                path: ['electionType'],
                equals: Prisma.AnyNull,
              },
            },
          },
        ],
      },
    })
  }

  private async getPendingP2V(electionDate: string) {
    return this.campaigns.count({
      where: {
        AND: [
          {
            details: {
              path: ['electionDate'],
              gt: electionDate,
            },
          },
          {
            details: {
              path: ['pledged'],
              equals: true,
            },
          },
          {
            OR: [
              {
                details: {
                  path: ['knowRun'],
                  equals: 'yes',
                },
              },
              {
                details: {
                  path: ['runForOffice'],
                  equals: 'yes',
                },
              },
            ],
          },
          {
            OR: [
              {
                pathToVictory: {
                  data: {
                    path: ['p2vStatus'],
                    equals: P2VStatus.waiting,
                  },
                },
              },
              {
                pathToVictory: {
                  data: {
                    path: ['p2vStatus'],
                    equals: Prisma.AnyNull,
                  },
                },
              },
            ],
          },
          {
            pathToVictory: {
              data: {
                path: ['p2vNotNeeded'],
                equals: Prisma.AnyNull,
              },
            },
          },
        ],
      },
    })
  }
}
