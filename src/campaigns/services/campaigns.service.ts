import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'
import { UpdateCampaignSchema } from '../schemas/updateCampaign.schema'
import { Campaign, Prisma, User } from '@prisma/client'
import { deepmerge as deepMerge } from 'deepmerge-ts'
import { buildSlug } from 'src/shared/util/slug.util'
import { getFullName } from 'src/users/util/users.util'
import { CampaignPlanVersionsService } from './campaignPlanVersions.service'
import {
  CampaignLaunchStatus,
  CampaignPlanVersionData,
  CampaignStatus,
  OnboardingStep,
  PlanVersion,
} from '../campaigns.types'
import { EmailService } from 'src/email/email.service'
import { EmailTemplateNames } from 'src/email/email.types'
import { UsersService } from 'src/users/users.service'
import { AiContentInputValues } from '../ai/content/aiContent.types'
import { WEBAPP_ROOT } from 'src/shared/util/appEnvironment.util'
import { BasePrismaService } from 'src/prisma/basePrisma.service'

@Injectable()
export class CampaignsService extends BasePrismaService<'campaign'> {
  constructor(
    private planVersionService: CampaignPlanVersionsService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    private emailService: EmailService,
  ) {
    super('campaign')
  }

  findByUser<T extends Prisma.CampaignInclude>(
    userId: Prisma.CampaignWhereInput['userId'],
    include?: T,
  ) {
    return this.findFirst({
      where: { userId },
      include,
    }) as Promise<Prisma.CampaignGetPayload<{ include: T }>>
  }

  async create(args: Prisma.CampaignCreateArgs) {
    return this.model.create(args)
  }
  async findBySubscriptionId(subscriptionId: string) {
    return this.findFirst({
      where: {
        details: {
          path: ['subscriptionId'],
          equals: subscriptionId,
        },
      },
    })
  }

  async createForUser(user: User) {
    const slug = await this.findSlug(user)

    const newCampaign = await this.model.create({
      data: {
        slug,
        isActive: false,
        userId: user.id,
        details: {
          zip: user.zip,
        },
        data: {
          slug,
          currentStep: OnboardingStep.registration,
        },
      },
    })

    // TODO:
    // await createCrmUser(user.firstName, user.lastName, user.email)

    return newCampaign
  }

  async update(args: Prisma.CampaignUpdateArgs) {
    const campaign = await this.model.update(args)
    campaign?.userId && (await this.usersService.trackUserById(campaign.userId))
    return campaign
  }

  async updateJsonFields(id: number, body: Omit<UpdateCampaignSchema, 'slug'>) {
    const { data, details, pathToVictory } = body

    return this.client.$transaction(async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id },
        include: { pathToVictory: true },
      })

      if (!campaign) return false

      const updateData = {
        data: data ? deepMerge(campaign.data as object, data) : undefined,
        details: details
          ? deepMerge(campaign.details as object, details)
          : undefined,
      }

      if (pathToVictory && campaign.pathToVictory) {
        /// TODO:
        // if (pathToVictory.hasOwnProperty('viability')) {
        //   await updateViability(campaign, columnKey2, value)
        // } else {
        //   await updatePathToVictory(campaign, columnKey, value)
        // }

        updateData['pathToVictory'] = {
          update: {
            data: {
              data: deepMerge(
                campaign.pathToVictory.data as object,
                pathToVictory,
              ),
            },
          },
        }
      }

      // TODO:
      // try {
      //   await sails.helpers.crm.updateCampaign(updated)
      // } catch (e) {
      //   sails.helpers.log(campaign.slug, 'error updating crm', e)
      // }

      campaign.userId &&
        (await this.usersService.trackUserById(campaign.userId))

      return tx.campaign.update({
        where: { id: campaign.id },
        data: updateData,
        include: { pathToVictory: true },
      })
    })
  }

  async patchCampaignDetails(
    campaignId: number,
    details: Partial<PrismaJson.CampaignDetails>,
  ) {
    const currentCampaign = await this.findFirst({ where: { id: campaignId } })
    if (!currentCampaign?.details) {
      throw new InternalServerErrorException(
        `Campaign ${campaignId} has no details JSON`,
      )
    }
    const { details: currentDetails } = currentCampaign

    const updatedDetails = deepMerge(currentDetails, details)

    return this.update({
      where: { id: campaignId },
      data: { details: updatedDetails },
    })
  }

  async persistCampaignProCancellation(campaign: Campaign) {
    await this.updateJsonFields(campaign.id, {
      details: {
        subscriptionId: null,
      },
    })
    await this.setIsPro(campaign.id, false)
  }

  async setIsPro(campaignId: number, isPro: boolean = true) {
    await Promise.allSettled([
      this.update({ where: { id: campaignId }, data: { isPro } }),
      this.patchCampaignDetails(campaignId, { isProUpdatedAt: Date.now() }), // TODO: this should be an ISO dateTime string, not a unix timestamp
    ])
    // TODO: Implement CRM updates
    // await sails.helpers.crm.updateCampaign(campaign);
  }

  async getStatus(user: User, campaign?: Campaign) {
    const timestamp = new Date().getTime()

    await this.usersService.updateUser(
      { id: user.id },
      {
        metaData: {
          ...user.metaData,
          lastVisited: timestamp,
        },
      },
    )

    if (!campaign) {
      let step = 'account-type'
      if (user.metaData?.accountType === 'browsing') {
        step = 'browsing'
      }
      return {
        status: false,
        step,
      }
    }

    const { data, details, slug, id } = campaign

    await this.model.update({
      where: { id },
      data: {
        data: { ...data, lastVisited: timestamp },
      },
    })

    if (campaign.isActive) {
      return {
        status: CampaignStatus.candidate,
        slug,
      }
    }
    let step = 1
    if (details?.office) {
      step = 2
    }
    if (details?.party || details?.otherParty) {
      step = 3
    }
    if (details?.pledged) {
      step = 4
    }

    return {
      status: CampaignStatus.onboarding,
      slug,
      step,
    }
  }

  delete(args: Prisma.CampaignDeleteArgs) {
    return this.model.delete(args)
  }

  deleteAll(args: Prisma.CampaignDeleteManyArgs) {
    return this.model.deleteMany(args)
  }

  async launch(user: User, campaign: Campaign) {
    const campaignData = campaign.data

    if (
      campaign.isActive ||
      campaignData.launchStatus === CampaignLaunchStatus.launched
    ) {
      this.logger.log('Campaign already launched, skipping launch')
      return true
    }

    // check if the user has office or otherOffice
    const details = campaign.details
    if (
      (!details.office || details.office === '') &&
      (!details.otherOffice || details.otherOffice === '')
    ) {
      throw new BadRequestException('Cannot launch campaign, Office not set')
    }

    await this.model.update({
      where: { id: campaign.id },
      data: {
        isActive: true,
        data: {
          ...campaignData,
          launchStatus: CampaignLaunchStatus.launched,
          currentStep: OnboardingStep.complete,
        },
      },
    })

    // TODO: reimplement
    // await sails.helpers.crm.updateCampaign(updated)
    // await sails.helpers.fullstory.customAttr(updated.id)

    await this.sendCampaignLaunchEmail(user)

    return true
  }

  async findSlug(user: User, suffix?: string) {
    const name = getFullName(user)
    const MAX_TRIES = 100
    const slug = buildSlug(name, suffix)
    const exists = await this.findUnique({ where: { slug } })
    if (!exists) {
      return slug
    }

    for (let i = 1; i < MAX_TRIES; i++) {
      const slug = buildSlug(`${name}${i}`, suffix)
      const exists = await this.findUnique({ where: { slug } })
      if (!exists) {
        return slug
      }
    }

    return slug as never // should not happen
  }

  async saveCampaignPlanVersion(inputs: {
    aiContent: PrismaJson.CampaignAiContent
    key: string
    campaignId: number
    inputValues?: AiContentInputValues | AiContentInputValues[]
    regenerate: boolean
    oldVersion: { date: Date; text: string }
  }) {
    const { aiContent, key, campaignId, inputValues, oldVersion, regenerate } =
      inputs

    // we determine language by examining inputValues and tag it on the version.
    let language = 'English'
    if (Array.isArray(inputValues) && inputValues.length > 0) {
      inputValues.forEach((inputValue) => {
        if (inputValue?.language) {
          language = inputValue.language as string
        }
      })
    }

    const newVersion = {
      date: new Date().toString(),
      text: aiContent[key]?.content,
      // if new inputValues are specified we use those
      // otherwise we use the inputValues from the prior generation.
      inputValues:
        Array.isArray(inputValues) && inputValues.length > 0
          ? inputValues
          : aiContent[key]?.inputValues,
      language: language,
    }

    const existingVersions =
      await this.planVersionService.findByCampaignId(campaignId)

    this.logger.log('existingVersions', existingVersions)

    let versions = {}
    if (existingVersions) {
      versions = existingVersions?.data as CampaignPlanVersionData
    }

    let foundKey = false
    if (!versions[key]) {
      versions[key] = []
    } else {
      foundKey = true
    }

    // determine if we should update the current version or add a new one.
    // if regenerate is true, we should always add a new version.
    // if regenerate is false and its been less than 5 minutes since the last generation
    // we should update the existing version.

    let updateExistingVersion = false
    if (regenerate === false && foundKey === true && versions[key].length > 0) {
      const lastVersion = versions[key][0] as PlanVersion
      const lastVersionDate = new Date(lastVersion?.date || 0)
      const now = new Date()
      const diff = now.getTime() - lastVersionDate.getTime()
      if (diff < 300000) {
        updateExistingVersion = true
      }
    }

    if (updateExistingVersion === true) {
      for (let i = 0; i < versions[key].length; i++) {
        const version = versions[key][i]
        if (
          JSON.stringify(version.inputValues) === JSON.stringify(inputValues)
        ) {
          // this version already exists. lets update it.
          versions[key][i].text = newVersion.text
          versions[key][i].date = new Date().toString()
          break
        }
      }
    }

    if (!foundKey && oldVersion) {
      this.logger.log(`no key found for ${key} yet we have oldVersion`)
      // here, we determine if we need to save an older version of the content.
      // because in the past we didn't create a Content version for every new generation.
      // otherwise if they translate they won't have the old version to go back to.
      versions[key].push(oldVersion)
    }

    if (updateExistingVersion === false) {
      this.logger.log('adding new version')
      // add new version to the top of the list.
      const length = versions[key].unshift(newVersion)
      if (length > 10) {
        versions[key].length = 10
      }
    }

    if (existingVersions) {
      await this.planVersionService.update(existingVersions.id, {
        data: versions,
      })
    } else {
      await this.planVersionService.create({
        campaignId: campaignId,
        data: versions,
      })
    }

    return true
  }

  private async sendCampaignLaunchEmail(user: User) {
    try {
      await this.emailService.sendTemplateEmail({
        to: user.email,
        subject: 'Full Suite of AI Campaign Tools Now Available',
        template: EmailTemplateNames.campaignLaunch,
        variables: {
          name: getFullName(user),
          link: `${WEBAPP_ROOT}/dashboard`,
        },
      })
    } catch (e) {
      this.logger.error('Error sending campaign launch email', e)
    }
  }
}

// async function updatePathToVictory(campaign, columnKey, value) {
//   try {
//     const p2v = await PathToVictory.findOrCreate(
//       {
//         campaign: campaign.id,
//       },
//       {
//         campaign: campaign.id,
//       },
//     )

//     const data = p2v.data || {}
//     const updatedData = {
//       ...data,
//       [columnKey]: value,
//     }

//     await PathToVictory.updateOne({ id: p2v.id }).set({
//       data: updatedData,
//     })

//     if (!campaign.pathToVictory) {
//       await Campaign.updateOne({ id: campaign.id }).set({
//         pathToVictory: p2v.id,
//       })
//     }
//   } catch (e) {
//     console.log('Error at updatePathToVictory', e)
//     await sails.helpers.slack.errorLoggerHelper(
//       'Error at updatePathToVictory',
//       e,
//     )
//   }
// }

// async function updateViability(campaign, columnKey, value) {
//   try {
//     const p2v = await PathToVictory.findOrCreate(
//       {
//         campaign: campaign.id,
//       },
//       {
//         campaign: campaign.id,
//       },
//     )

//     const data = p2v.data || {}
//     const viability = data.viability || {}
//     const updatedData = {
//       ...data,
//       viability: {
//         ...viability,
//         [columnKey]: value,
//       },
//     }

//     await PathToVictory.updateOne({ id: p2v.id }).set({
//       data: updatedData,
//     })

//     if (!campaign.pathToVictory) {
//       await Campaign.updateOne({ id: campaign.id }).set({
//         pathToVictory: p2v.id,
//       })
//     }
//   } catch (e) {
//     console.log('Error at updateViability', e)
//     await sails.helpers.slack.errorLoggerHelper('Error at updateViability', e)
//   }
// }
