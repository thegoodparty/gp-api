import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'
import { Campaign, Prisma, User } from '@prisma/client'
import { deepmerge as deepMerge } from 'deepmerge-ts'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { ElectionsService } from 'src/elections/services/elections.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { objectNotEmpty } from 'src/shared/util/objects.util'
import { buildSlug } from 'src/shared/util/slug.util'
import { UsersService } from 'src/users/services/users.service'
import { getUserFullName } from 'src/users/util/users.util'
import { GooglePlacesService } from 'src/vendors/google/services/google-places.service'
import { StripeService } from '../../vendors/stripe/services/stripe.service'
import { AiContentInputValues } from '../ai/content/aiContent.types'
import {
  CampaignLaunchStatus,
  CampaignPlanVersionData,
  CampaignStatus,
  OnboardingStep,
  PlanVersion,
} from '../campaigns.types'
import { UpdateCampaignSchema } from '../schemas/updateCampaign.schema'
import { CampaignPlanVersionsService } from './campaignPlanVersions.service'
import { CrmCampaignsService } from './crmCampaigns.service'

enum CandidateVerification {
  yes = 'YES',
  no = 'NO',
}

@Injectable()
export class CampaignsService extends createPrismaBase(MODELS.Campaign) {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    @Inject(forwardRef(() => CrmCampaignsService))
    private readonly crm: CrmCampaignsService,
    private readonly analytics: AnalyticsService,
    private planVersionService: CampaignPlanVersionsService,
    private readonly stripeService: StripeService,
    private readonly googlePlaces: GooglePlacesService,
    private readonly elections: ElectionsService,
    private readonly slack: SlackService,
  ) {
    super()
  }

  findByUserId<T extends Prisma.CampaignInclude>(
    userId: Prisma.CampaignWhereInput['userId'],
    include?: T,
  ) {
    return this.findFirst({
      where: { userId },
      include,
    }) as Promise<Prisma.CampaignGetPayload<{ include: T }>>
  }

  async create(args: Prisma.CampaignCreateArgs) {
    return await this.model.create(args)
  }

  // TODO: Find a way to make these JSON path lookups type-safe

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
  // TODO: Find a way to make these JSON path lookups type-safe

  async findByHubspotId(hubspotId: string) {
    return this.findFirst({
      where: {
        data: {
          path: ['hubspotId'],
          equals: hubspotId,
        },
      },
    })
  }
  async createForUser(user: User) {
    this.logger.debug('Creating campaign for user', user)
    const slug = await this.findSlug(user)

    const newCampaign = await this.create({
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
    this.logger.debug('Created campaign', newCampaign)
    await this.crm.trackCampaign(newCampaign.id)

    return newCampaign
  }

  async update(args: Prisma.CampaignUpdateArgs) {
    const campaign = await this.model.update(args)
    const isPro = args?.data?.isPro
    if (isPro) {
      await this.analytics.identify(campaign?.userId, { isPro })
    }
    await this.crm.trackCampaign(campaign.id)
    return campaign
  }

  async updateJsonFields(
    id: number,
    body: Omit<UpdateCampaignSchema, 'slug'>,
    trackCampaign: boolean = true,
  ) {
    const {
      data,
      details,
      pathToVictory,
      aiContent,
      formattedAddress,
      placeId,
      canDownloadFederal,
    } = body

    const updatedCampaign = await this.client.$transaction(
      async (tx) => {
        this.logger.debug('Updating campaign json fields', { id, body })
        // TODO: This should be .findUniqueOrThrow which would remove the need
        //  for the null check below and subsequently simplify the return
        //  signature of this method
        //  https://goodparty.atlassian.net/browse/WEB-4384
        const campaign = await tx.campaign.findFirst({
          where: { id },
          include: { pathToVictory: true },
        })

        if (!campaign) return false

        // Handle data and details JSON fields
        const campaignUpdateData = {} as Prisma.CampaignUpdateInput
        if (data) {
          campaignUpdateData.data = deepMerge(campaign.data as object, data)
        }
        if (formattedAddress !== undefined) {
          campaignUpdateData.formattedAddress = formattedAddress
        }
        if (placeId !== undefined) {
          campaignUpdateData.placeId = placeId
        }
        if (canDownloadFederal !== undefined) {
          campaignUpdateData.canDownloadFederal = canDownloadFederal
        }
        if (details) {
          const mergedDetails = deepMerge(
            campaign.details as object,
            details,
          ) as PrismaJson.CampaignDetails
          if (details?.customIssues) {
            // If this isn't done, customIssues' entries duplicate
            mergedDetails.customIssues = details.customIssues as Array<{
              position: string
              title: string
            }>
          }
          if (details.runningAgainst) {
            // If this isn't done, runningAgainst's entries duplicate
            mergedDetails.runningAgainst = details.runningAgainst as Array<{
              name: string
              party: string
              description: string
            }>
          }
          campaignUpdateData.details = mergedDetails
        }
        if (objectNotEmpty(aiContent as object)) {
          campaignUpdateData.aiContent = deepMerge(
            (campaign.aiContent as object) || {},
            aiContent,
          ) as PrismaJson.CampaignAiContent
        }

        // Update the campaign with JSON fields
        await tx.campaign.update({
          where: { id: campaign.id },
          data: campaignUpdateData,
        })

        // Handle pathToVictory relation separately if needed
        if (objectNotEmpty(pathToVictory as object)) {
          if (campaign.pathToVictory) {
            await tx.pathToVictory.update({
              where: { id: campaign.pathToVictory.id },
              data: {
                data: deepMerge(
                  (campaign.pathToVictory.data as object) || {},
                  pathToVictory,
                ),
              },
            })
          } else {
            await tx.pathToVictory.create({
              data: {
                campaignId: campaign.id,
                data: pathToVictory,
              },
            })
          }
        }

        // Return the updated campaign with pathToVictory included
        // TODO: Also should be .findUniqueOrThrow
        //  https://goodparty.atlassian.net/browse/WEB-4384
        return tx.campaign.findFirst({
          where: { id: campaign.id },
          include: { pathToVictory: true },
        })
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    )

    // TODO: this should throw an exception if the update failed
    //  https://goodparty.atlassian.net/browse/WEB-4384
    if (updatedCampaign && trackCampaign) {
      // Track campaign and user
      await this.crm.trackCampaign(updatedCampaign.id)
    }

    return updatedCampaign ? updatedCampaign : null
  }

  async patchCampaignDetails(
    campaignId: number,
    details: Partial<PrismaJson.CampaignDetails>,
  ) {
    const currentCampaign = await this.model.findFirst({
      where: { id: campaignId },
    })
    if (!currentCampaign?.details) {
      throw new InternalServerErrorException(
        `Campaign ${campaignId} has no details JSON`,
      )
    }
    const { details: currentDetails } = currentCampaign

    const updatedDetails = {
      ...currentDetails,
      ...details,
    } as typeof currentDetails
    const updatedCampaign = await this.client.$transaction(
      async (tx) =>
        tx.campaign.update({
          where: { id: campaignId },
          data: { details: updatedDetails },
        }),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    )

    return updatedCampaign
  }

  async persistCampaignProCancellation(campaign: Campaign) {
    await this.updateJsonFields(
      campaign.id,
      {
        details: {
          subscriptionId: null,
        },
      },
      false,
    )
    await this.setIsPro(campaign.id, false, false)
    await this.crm.trackCampaign(campaign.id)
  }

  async setIsPro(
    campaignId: number,
    isPro: boolean = true,
    trackCampaign: boolean = true,
  ) {
    const existingCampaign = await this.model.findUnique({
      where: { id: campaignId },
      select: { isPro: true, hasFreeTextsOffer: true },
    })

    const isBecomingProFirstTime = !existingCampaign?.isPro && isPro

    const campaign = await this.model.update({
      where: { id: campaignId },
      data: {
        isPro,
        ...(isBecomingProFirstTime && { hasFreeTextsOffer: true }),
      },
    })
    // Must be in serial so as to not overwrite campaign details w/ concurrent queries
    await this.patchCampaignDetails(campaignId, {
      isProUpdatedAt: Date.now(),
    }) // TODO: this should be an ISO dateTime string, not a unix timestamp

    if (trackCampaign) {
      const updatedIsPro = campaign?.isPro
      if (updatedIsPro) {
        await this.analytics.identify(campaign?.userId, { isPro: updatedIsPro })
      }
      await this.crm.trackCampaign(campaignId)
    }
  }

  async checkFreeTextsEligibility(campaignId: number): Promise<boolean> {
    const campaign = await this.model.findUnique({
      where: { id: campaignId },
      select: { hasFreeTextsOffer: true },
    })
    return campaign?.hasFreeTextsOffer ?? false
  }

  async redeemFreeTexts(campaignId: number): Promise<void> {
    const result = await this.client.$transaction(
      async (tx) => {
        const updatedCampaign = await tx.campaign.updateMany({
          where: {
            id: campaignId,
            hasFreeTextsOffer: true,
          },
          data: { hasFreeTextsOffer: false },
        })

        if (updatedCampaign.count === 0) {
          throw new BadRequestException(
            'No free texts offer available for this campaign',
          )
        }

        const campaign = await tx.campaign.findUnique({
          where: { id: campaignId },
          select: { userId: true },
        })

        return campaign?.userId
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    )
    if (result) {
      this.analytics.track(result, EVENTS.Outreach.FreeTextsOfferRedeemed, {
        campaignId,
        redeemedAt: new Date().toISOString(),
      })
    }
  }

  async getStatus(campaign?: Campaign) {
    const timestamp = new Date().getTime()

    if (!campaign) {
      return {
        status: false,
      }
    }

    const { data, details, slug, id } = campaign

    await this.model.update({
      where: { id },
      data: {
        data: { ...data, lastVisited: timestamp },
      },
    })

    const isVerified =
      campaign.isVerified ||
      data?.hubSpotUpdates?.verified_candidates?.toUpperCase() ===
        CandidateVerification.yes

    if (campaign.isActive) {
      return {
        status: CampaignStatus.candidate,
        slug,
        isVerified,
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

    await this.crm.trackCampaign(campaign.id)

    return true
  }

  async findSlug(user: User, suffix?: string) {
    const name = getUserFullName(user)
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

  async updateCampaignAddress(
    campaignId: number,
    formattedAddress: string,
    placeId: string,
  ) {
    return this.model.update({
      where: { id: campaignId },
      data: {
        formattedAddress,
        placeId,
      } as Prisma.CampaignUpdateInput & {
        formattedAddress: string
        placeId: string
      },
    })
  }
}
