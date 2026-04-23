import {
  CampaignLaunchStatus,
  CampaignStatus,
  OnboardingStep,
  type ListCampaignsPagination,
} from '@goodparty_org/contracts'
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
import { ElectionsService } from 'src/elections/services/elections.service'
import { RaceTargetMetrics } from 'src/elections/types/elections.types'
import { OrganizationsService } from 'src/organizations/services/organizations.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import {
  DEFAULT_PAGINATION_LIMIT,
  DEFAULT_PAGINATION_OFFSET,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
} from 'src/shared/constants/paginationOptions.consts'
import { PaginatedResults, WrapperType } from 'src/shared/types/utility.types'
import { objectNotEmpty } from 'src/shared/util/objects.util'
import { buildSlug } from 'src/shared/util/slug.util'
import { UsersService } from 'src/users/services/users.service'
import { getUserFullName } from 'src/users/util/users.util'
import { GooglePlacesService } from 'src/vendors/google/services/google-places.service'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { StripeService } from '../../vendors/stripe/services/stripe.service'
import { AiContentInputValues } from '../ai/content/aiContent.types'
import {
  CampaignPlanVersionData,
  CampaignWithOrg,
  PlanVersion,
  UpdateCampaignFieldsInput,
} from '../campaigns.types'
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
    private usersService: WrapperType<UsersService>,
    @Inject(forwardRef(() => CrmCampaignsService))
    private readonly crm: WrapperType<CrmCampaignsService>,
    private readonly analytics: AnalyticsService,
    private planVersionService: CampaignPlanVersionsService,
    private readonly stripeService: StripeService,
    private readonly googlePlaces: GooglePlacesService,
    private readonly elections: ElectionsService,
    private readonly organizations: OrganizationsService,
    private readonly slack: SlackService,
  ) {
    super()
  }

  findByUserId<T extends Prisma.CampaignInclude>(
    userId: Prisma.CampaignWhereInput['userId'],
    include?: T,
  ) {
    // Prisma include query — TypeScript cannot narrow the included relations at compile time
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return this.findFirst({
      where: { userId },
      include,
    }) as Promise<Prisma.CampaignGetPayload<{ include: T }>>
  }

  async listCampaigns({
    offset: skip = DEFAULT_PAGINATION_OFFSET,
    limit = DEFAULT_PAGINATION_LIMIT,
    sortBy = DEFAULT_SORT_BY,
    sortOrder = DEFAULT_SORT_ORDER,
    userId,
    slug,
  }: ListCampaignsPagination): Promise<
    PaginatedResults<Campaign & { positionName: string | null }>
  > {
    const where: Prisma.CampaignWhereInput = {
      ...(userId ? { userId } : {}),
      ...(slug
        ? { slug: { contains: slug, mode: Prisma.QueryMode.insensitive } }
        : {}),
    }

    const campaigns = await this.model.findMany({
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      where,
      include: { organization: true },
    })

    const uniquePositionIds = [
      ...new Set(
        campaigns
          .map((c: CampaignWithOrg) => c.organization.positionId)
          .filter((id): id is string => id !== null),
      ),
    ]
    const resolvedPositions = await Promise.all(
      uniquePositionIds.map((positionId) =>
        this.organizations.resolvePositionContext({ positionId }),
      ),
    )
    const positionNameById = new Map(
      uniquePositionIds.map((id, i) => [id, resolvedPositions[i].positionName]),
    )

    return {
      data: campaigns.map((item: CampaignWithOrg) => {
        const { organization: org, ...campaign } = item
        const positionName =
          org.customPositionName ??
          (org.positionId
            ? (positionNameById.get(org.positionId) ?? null)
            : null)
        return { ...campaign, positionName }
      }),
      meta: {
        total: await this.model.count({ where }),
        offset: skip,
        limit,
      },
    }
  }

  async findByIdWithOrg(
    id: number,
  ): Promise<Campaign & { positionName: string | null }> {
    const { organization: org, ...campaign } =
      (await this.model.findUniqueOrThrow({
        where: { id },
        include: { organization: true },
      })) as CampaignWithOrg
    const { positionName } = await this.organizations.resolvePositionContext({
      customPositionName: org.customPositionName,
      positionId: org.positionId,
    })
    return { ...campaign, positionName }
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
  async createForUser(
    user: User,
    initialData: {
      details: PrismaJson.CampaignDetails
      data?: PrismaJson.CampaignData
    },
    orgPosition?: {
      ballotReadyPositionId?: string
      customPositionName?: string
    },
  ) {
    this.logger.debug(user, 'Creating campaign for user')
    const slug = await this.findSlug(user)

    const baseData: PrismaJson.CampaignData = {
      slug,
    }

    const position = orgPosition?.ballotReadyPositionId
      ? await this.elections.getPositionByBallotReadyId(
          orgPosition.ballotReadyPositionId,
        )
      : null

    const resolvedCustomPositionName = !position
      ? (orgPosition?.customPositionName ?? null)
      : null

    const newCampaign = await this.client.$transaction(async (tx) => {
      const [{ nextval: id }] = await tx.$queryRaw<[{ nextval: bigint }]>`
        SELECT nextval('campaign_id_seq')`

      const campaignId = Number(id)
      const orgSlug = OrganizationsService.campaignOrgSlug(campaignId)

      this.logger.info(
        {
          ballotReadyPositionId: orgPosition?.ballotReadyPositionId,
          position,
          campaignId,
          orgSlug,
        },
        'Creating organization',
      )

      await tx.organization.create({
        data: {
          slug: orgSlug,
          ownerId: user.id,
          positionId: position?.id ?? null,
          customPositionName: resolvedCustomPositionName,
        },
      })

      const mergedDetails = deepMerge(
        { zip: user.zip } as object,
        initialData.details as object,
      ) as PrismaJson.CampaignDetails

      return tx.campaign.create({
        data: {
          id: campaignId,
          slug,
          organizationSlug: orgSlug,
          isActive: false,
          userId: user.id,
          details: mergedDetails,
          data: initialData.data
            ? deepMerge(baseData, initialData.data)
            : baseData,
        },
      })
    })
    this.logger.debug({ newCampaign }, 'Created campaign')
    await this.crm.trackCampaign(newCampaign.id)

    return newCampaign
  }

  async update(args: Prisma.CampaignUpdateArgs & { where: { id: number } }) {
    const campaign = await this.client.$transaction(async (tx) => {
      return tx.campaign.update(args)
    })
    const isPro = args?.data?.isPro
    if (isPro) {
      await this.analytics.identify(campaign?.userId, { isPro })
    }
    await this.crm.trackCampaign(campaign.id)
    return campaign
  }

  async updateJsonFields(
    id: number,
    body: UpdateCampaignFieldsInput,
    trackCampaign: boolean = true,
    scalarFields?: Prisma.CampaignUpdateInput,
  ) {
    const {
      data,
      details,
      aiContent,
      formattedAddress,
      placeId,
      canDownloadFederal,
      overrideDistrictId,
    } = body

    const updatedCampaign = await this.client.$transaction(
      async (tx) => {
        this.logger.debug({ id, body }, 'Updating campaign json fields')
        // TODO: This should be .findUniqueOrThrow which would remove the need
        //  for the null check below and subsequently simplify the return
        //  signature of this method
        //  https://goodparty.atlassian.net/browse/WEB-4384
        const campaign = await tx.campaign.findFirst({
          where: { id },
        })

        if (!campaign) return false

        const campaignUpdateData: Prisma.CampaignUpdateInput = {
          ...scalarFields,
        }
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
            // Prisma JSON column typed as JsonValue — requires prisma-json-types-generator to narrow
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            mergedDetails.customIssues = details.customIssues as Array<{
              position: string
              title: string
            }>
          }
          if (details.runningAgainst) {
            // If this isn't done, runningAgainst's entries duplicate
            // Prisma JSON column typed as JsonValue — requires prisma-json-types-generator to narrow
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            mergedDetails.runningAgainst = details.runningAgainst as Array<{
              name: string
              party: string
              description: string
            }>
          }
          campaignUpdateData.details = mergedDetails
        }
        if (objectNotEmpty(aiContent)) {
          // Prisma JSON column typed as JsonValue — prisma-json-types-generator cannot narrow here
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          campaignUpdateData.aiContent = deepMerge(
            (campaign.aiContent as object) || {},
            aiContent,
          ) as PrismaJson.CampaignAiContent
        }

        if (overrideDistrictId !== undefined) {
          const orgSlug = OrganizationsService.campaignOrgSlug(campaign.id)
          const districtId = overrideDistrictId ?? null
          await tx.organization.update({
            where: { slug: orgSlug },
            data: { overrideDistrictId: districtId },
          })
        }

        // TODO: Also should be .findUniqueOrThrow
        //  https://goodparty.atlassian.net/browse/WEB-4384
        return tx.campaign.update({
          where: { id: campaign.id },
          data: campaignUpdateData,
        })
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    )

    // TODO: this should throw an exception if the update failed
    //  https://goodparty.atlassian.net/browse/WEB-4384
    if (updatedCampaign && trackCampaign) {
      if (scalarFields?.isPro) {
        await this.analytics.identify(updatedCampaign.userId, {
          isPro: scalarFields.isPro,
        })
      }
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
    }
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
      select: {
        isPro: true,
        hasFreeTextsOffer: true,
        freeTextsOfferRedeemedAt: true,
      },
    })

    const isBecomingProFirstTime = !existingCampaign?.isPro && isPro
    const hasNeverRedeemedFreeTexts =
      !existingCampaign?.freeTextsOfferRedeemedAt
    const shouldGrantOffer = isBecomingProFirstTime && hasNeverRedeemedFreeTexts

    const campaign = await this.model.update({
      where: { id: campaignId },
      data: {
        isPro,
        ...(shouldGrantOffer && { hasFreeTextsOffer: true }),
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
          data: {
            hasFreeTextsOffer: false,
            freeTextsOfferRedeemedAt: new Date(),
          },
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

    const {
      data,
      details,
      slug,
      id,
      isActive,
      organizationSlug,
      isVerified: campaignIsVerified,
    } = campaign

    await this.model.update({
      where: { id },
      data: {
        data: { ...data, lastVisited: timestamp },
      },
    })

    const isVerified =
      campaignIsVerified ||
      data?.hubSpotUpdates?.verified_candidates?.toUpperCase() ===
        CandidateVerification.yes

    if (isActive) {
      return {
        status: CampaignStatus.candidate,
        slug,
        isVerified,
      }
    }
    let step = 1
    const org = organizationSlug
      ? await this.organizations.findUnique({
          where: { slug: organizationSlug },
        })
      : null
    if (org?.positionId || org?.customPositionName) {
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

  async launch(campaign: Campaign) {
    const { id, organizationSlug, data: campaignData, isActive } = campaign

    if (
      isActive ||
      campaignData.launchStatus === CampaignLaunchStatus.launched
    ) {
      this.logger.info('Campaign already launched, skipping launch')
      return true
    }

    const org = organizationSlug
      ? await this.organizations.findUnique({
          where: { slug: organizationSlug },
        })
      : null
    if (!org?.positionId && !org?.customPositionName) {
      throw new BadRequestException('Cannot launch campaign, Office not set')
    }

    await this.model.update({
      where: { id },
      data: {
        isActive: true,
        data: {
          ...campaignData,
          launchStatus: CampaignLaunchStatus.launched,
          currentStep: OnboardingStep.complete,
        },
      },
    })

    await this.crm.trackCampaign(id)

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

    throw new InternalServerErrorException(
      `Could not find unique slug for user ${user.id} after ${MAX_TRIES} attempts`,
    )
  }

  async saveCampaignPlanVersion(inputs: {
    aiContent: PrismaJson.CampaignAiContent
    key: string
    campaignId: number
    inputValues?: AiContentInputValues | AiContentInputValues[]
    regenerate: boolean
    oldVersion?: { date: Date; text: string }
  }) {
    const { aiContent, key, campaignId, inputValues, oldVersion, regenerate } =
      inputs

    // we determine language by examining inputValues and tag it on the version.
    let language = 'English'
    if (Array.isArray(inputValues) && inputValues.length > 0) {
      inputValues.forEach((inputValue) => {
        if (typeof inputValue?.language === 'string') {
          language = inputValue.language
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

    this.logger.info({ existingVersions }, 'existingVersions')

    let versions: CampaignPlanVersionData = {}
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
      this.logger.info(`no key found for ${key} yet we have oldVersion`)
      // here, we determine if we need to save an older version of the content.
      // because in the past we didn't create a Content version for every new generation.
      // otherwise if they translate they won't have the old version to go back to.
      versions[key].push({
        ...oldVersion,
        date: oldVersion.date.toString(),
      })
    }

    if (updateExistingVersion === false) {
      this.logger.info('adding new version')
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

  async fetchLiveRaceTargetMetrics(
    campaign: Campaign,
  ): Promise<RaceTargetMetrics | null> {
    const { details, organizationSlug, id: campaignId } = campaign
    const { electionDate } = details ?? {}
    if (!electionDate) return null

    const org = organizationSlug
      ? await this.organizations.findUnique({
          where: { slug: organizationSlug },
        })
      : null

    if (!org?.overrideDistrictId && !org?.positionId) return null

    if (org.overrideDistrictId) {
      const result = await this.elections
        .buildRaceTargetDetails({
          districtId: org.overrideDistrictId,
          electionDate,
        })
        .catch(() => null)

      const { projectedTurnout, winNumber, voterContactGoal } = result ?? {}
      if (!projectedTurnout || projectedTurnout <= 0) return null

      return {
        projectedTurnout,
        winNumber: winNumber ?? 0,
        voterContactGoal: voterContactGoal ?? 0,
      }
    }

    const result = await this.elections
      .getPositionMatchedRaceTargetDetails({
        positionId: org.positionId!,
        electionDate,
        includeTurnout: true,
        campaignId,
        officeName: undefined,
      })
      .catch(() => null)

    if (!result || result.projectedTurnout <= 0) return null

    const { projectedTurnout, winNumber, voterContactGoal } = result
    return { projectedTurnout, winNumber, voterContactGoal }
  }
}
