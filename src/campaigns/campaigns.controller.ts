import { M2MOnly } from '@/authentication/guards/M2MOnly.guard'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ZodResponseInterceptor } from '@/shared/interceptors/ZodResponse.interceptor'
import { IdParamSchema } from '@/shared/schemas/IdParam.schema'
import { PaginatedResponseSchema } from '@/shared/schemas/PaginatedResponse.schema'
import {
  ListCampaignsPaginationSchema,
  ReadCampaignOutputSchema,
  SetDistrictOutputSchema,
  UpdateCampaignM2MSchema,
} from '@goodparty_org/contracts'
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { Campaign, Prisma, User, UserRole } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { createZodDto, ZodValidationPipe } from 'nestjs-zod'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { ElectionsService } from 'src/elections/services/elections.service'
import { P2VStatus } from 'src/elections/types/pathToVictory.types'
import { P2VSource } from 'src/pathToVictory/types/pathToVictory.types'
import { userHasRole } from 'src/users/util/users.util'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { Roles } from '../authentication/decorators/Roles.decorator'
import { ReqCampaign } from './decorators/ReqCampaign.decorator'
import { UseCampaign } from './decorators/UseCampaign.decorator'
import { UpdateRaceTargetDetailsBySlugQueryDTO } from './schemas/adminRaceTargetDetails.schema'
import { CampaignListSchema } from './schemas/campaignList.schema'
import {
  CreateCampaignSchema,
  SetDistrictDTO,
  SetDistrictM2MDTO,
  UpdateCampaignSchema,
} from './schemas/updateCampaign.schema'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { CampaignsService } from './services/campaigns.service'
import { CampaignWith, CampaignWithPathToVictory } from './campaigns.types'
import { buildCampaignListFilters } from './util/buildCampaignListFilters'

class ListCampaignsPaginationDto extends createZodDto(
  ListCampaignsPaginationSchema,
) {}

class UpdateCampaignM2MDto extends createZodDto(UpdateCampaignM2MSchema) {}

@Controller('campaigns')
@UsePipes(ZodValidationPipe)
@UseInterceptors(ZodResponseInterceptor)
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly planVersions: CampaignPlanVersionsService,
    private readonly slack: SlackService,
    private readonly elections: ElectionsService,
    private readonly organizations: OrganizationsService,
    private readonly analytics: AnalyticsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignsController.name)
  }

  //TODO: remove this when we start using the admin portal.
  @Roles(UserRole.admin)
  @Get()
  findAll(@Query() query: CampaignListSchema) {
    let where: Prisma.CampaignWhereInput = {}
    if (Object.values(query).some((value) => !!value)) {
      where = buildCampaignListFilters(query)
    }
    const include = {
      user: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          metaData: true,
        },
      },
      pathToVictory: {
        select: {
          data: true,
        },
      },
    }
    return this.campaigns.findMany({ where, include })
  }

  @Get('mine')
  @UseCampaign({ include: { pathToVictory: true, organization: true } })
  async findMine(
    @ReqCampaign()
    campaign: CampaignWith<'pathToVictory' | 'organization'>,
  ) {
    const { organization: org } = campaign

    const [{ positionName }, enriched] = await Promise.all([
      this.organizations.resolvePositionContext({
        customPositionName: org?.customPositionName,
        positionId: org?.positionId,
      }),
      this.withLiveMetrics(campaign),
    ])

    return { ...enriched, positionName }
  }

  @UseGuards(M2MOnly)
  @Get('list')
  @ResponseSchema(PaginatedResponseSchema(ReadCampaignOutputSchema))
  async list(@Query() query: ListCampaignsPaginationDto) {
    const { data, meta } = await this.campaigns.listCampaigns(query)
    return { data, meta }
  }

  @Get('mine/status')
  @UseCampaign({ continueIfNotFound: true })
  async getUserCampaignStatus(@ReqCampaign() campaign?: Campaign) {
    return this.campaigns.getStatus(campaign)
  }

  @Get('mine/plan-version')
  @UseCampaign()
  async getCampaignPlanVersion(@ReqCampaign() campaign: Campaign) {
    const version = await this.planVersions.findByCampaignId(campaign.id)

    if (!version) throw new NotFoundException('No plan version found')

    return version.data
  }

  @Get('slug/:slug')
  @Roles(UserRole.admin)
  async findBySlug(@Param('slug') slug: string) {
    const campaign = await this.campaigns.findFirst({
      where: { slug },
      include: {
        pathToVictory: true,
        organization: {
          select: {
            customPositionName: true,
            positionId: true,
          },
        },
      },
    })

    if (!campaign) throw new NotFoundException()

    const [{ positionName }, enriched] = await Promise.all([
      this.organizations.resolvePositionContext({
        customPositionName: campaign.organization?.customPositionName,
        positionId: campaign.organization?.positionId,
      }),
      this.withLiveMetrics(campaign),
    ])

    return { ...enriched, positionName }
  }

  @Post()
  async create(@ReqUser() user: User, @Body() body: CreateCampaignSchema) {
    const existing = await this.campaigns.findByUserId(user.id)
    if (existing) {
      throw new ConflictException('User campaign already exists.')
    }
    return this.campaigns.createForUser(
      user,
      { details: body.details, data: body.data },
      {
        ballotReadyPositionId: body.ballotReadyPositionId ?? undefined,
        customPositionName: body.customPositionName ?? undefined,
      },
    )
  }

  @Put('mine')
  @UseCampaign({ continueIfNotFound: true })
  async update(
    @ReqUser() user: User,
    @ReqCampaign() campaign: Campaign,
    @Body() dto: UpdateCampaignSchema,
  ) {
    const { slug, ...body } = dto

    if (body.canDownloadFederal && !userHasRole(user, [UserRole.admin])) {
      throw new ForbiddenException(
        'User does not have permission to download federal data',
      )
    }

    if (
      typeof slug === 'string' &&
      campaign?.slug !== slug &&
      userHasRole(user, [UserRole.admin, UserRole.sales])
    ) {
      campaign = await this.campaigns.findFirstOrThrow({
        where: { slug },
      })

      if (body?.details) {
        const { city, electionDate, pledged, party } = body.details

        await this.analytics.identify(campaign.userId, {
          ...(city && { officeMunicipality: city }),
          ...(electionDate && { officeElectionDate: electionDate }),
          ...(party && { affiliation: party }),
          ...(pledged && { pledged }),
        })
      }
    } else if (!campaign) throw new NotFoundException('Campaign not found')

    this.logger.debug({ campaign, ...{ slug, body } }, 'Updating campaign')

    const updated = await this.campaigns.updateJsonFields(campaign.id, body)
    if (!updated) throw new NotFoundException('Campaign not found after update')
    return this.withLiveMetrics(updated)
  }

  @UseGuards(M2MOnly)
  @Get(':id')
  @ResponseSchema(ReadCampaignOutputSchema)
  async findById(@Param() { id }: IdParamSchema) {
    return this.campaigns.findUniqueOrThrow({
      where: { id },
    })
  }

  @UseGuards(M2MOnly)
  @Put(':id')
  @ResponseSchema(ReadCampaignOutputSchema)
  async updateCampaign(
    @Param() { id }: IdParamSchema,
    @Body() body: UpdateCampaignM2MDto,
  ) {
    await this.campaigns.findUniqueOrThrow({
      where: { id },
      select: { id: true },
    })

    const { data, details, aiContent, ...scalarFields } = body

    return this.campaigns.updateJsonFields(
      id,
      { data, details, aiContent },
      true,
      Object.values(scalarFields).some((v) => v !== undefined)
        ? scalarFields
        : undefined,
    )
  }

  @Post('launch')
  @UseCampaign()
  @HttpCode(HttpStatus.OK)
  async launch(@ReqCampaign() campaign: Campaign) {
    try {
      const launchResult = await this.campaigns.launch(campaign)
      return launchResult
    } catch (e) {
      this.logger.error({ e }, 'Error at campaign launch')
      await this.slack.errorMessage({
        message: 'Error at campaign launch',
        error: e,
      })

      throw e
    }
  }

  @Put('mine/district')
  @UseCampaign()
  @ResponseSchema(SetDistrictOutputSchema)
  async setDistrict(
    @ReqCampaign() campaign: Campaign,
    @ReqUser() user: User,
    @Body()
    {
      slug,
      L2DistrictType: l2DistrictType,
      L2DistrictName: l2DistrictName,
    }: SetDistrictDTO,
  ) {
    if (
      slug &&
      campaign?.slug !== slug &&
      userHasRole(user, [UserRole.admin, UserRole.sales])
    ) {
      campaign = await this.campaigns.findFirstOrThrow({
        where: { slug },
      })
    } else if (!campaign) throw new NotFoundException('Campaign not found')

    this.logger.debug(
      {
        campaign,
        ...{
          slug,
          L2DistrictType: l2DistrictType,
          L2DistrictName: l2DistrictName,
        },
      },
      'Updating campaign with district',
    )

    return this.applyDistrictUpdate(campaign, l2DistrictType, l2DistrictName)
  }

  private async applyDistrictUpdate(
    campaign: Campaign,
    l2DistrictType: string,
    l2DistrictName: string,
  ) {
    const raceTargetDetails = await this.elections.buildRaceTargetDetails({
      L2DistrictType: l2DistrictType,
      L2DistrictName: l2DistrictName,
      electionDate: campaign.details?.electionDate || '',
      state: campaign.details?.state || '',
    })

    const hasTurnout =
      !!raceTargetDetails?.projectedTurnout &&
      raceTargetDetails.projectedTurnout > 0

    const campaignOrg = await this.organizations.findUnique({
      where: { slug: OrganizationsService.campaignOrgSlug(campaign.id) },
    })

    const overrideDistrictId =
      await this.organizations.resolveOverrideDistrictId({
        positionId: campaignOrg?.positionId ?? undefined,
        state: campaign.details?.state || '',
        L2DistrictType: l2DistrictType,
        L2DistrictName: l2DistrictName,
      })

    const updated = await this.campaigns.updateJsonFields(campaign.id, {
      pathToVictory: {
        ...(!hasTurnout ? { p2vStatus: P2VStatus.districtMatched } : {}),
        p2vAttempts: 0,
        officeContextFingerprint: null,
      },
      overrideDistrictId,
    })
    if (!updated) throw new NotFoundException('Campaign not found after update')
    return this.withLiveMetrics(updated)
  }

  @UseGuards(M2MOnly)
  @Put(':id/district')
  @ResponseSchema(SetDistrictOutputSchema)
  async setDistrictM2M(
    @Param() { id }: IdParamSchema,
    @Body()
    {
      L2DistrictType: l2DistrictType,
      L2DistrictName: l2DistrictName,
    }: SetDistrictM2MDTO,
  ) {
    const campaign = await this.campaigns.findUniqueOrThrow({
      where: { id },
    })

    this.logger.debug(
      {
        campaignId: id,
        L2DistrictType: l2DistrictType,
        L2DistrictName: l2DistrictName,
      },
      'M2M: Updating campaign with district',
    )

    return this.applyDistrictUpdate(campaign, l2DistrictType, l2DistrictName)
  }

  @Put('mine/race-target-details')
  @UseCampaign()
  async updateRaceTargetDetails(@ReqCampaign() campaign: Campaign) {
    const { ballotreadyPositionId, positionName } =
      await this.resolveRaceTargetPositionContext(campaign)

    if (!ballotreadyPositionId || !campaign.details.electionDate) {
      throw new BadRequestException(
        `Error: The campaign's organization has no BallotReady position or the campaign has no electionDate — the candidate likely hasn't selected an office yet`,
      )
    }

    const raceTargetDetails = await this.elections
      .getPositionMatchedRaceTargetDetails({
        campaignId: campaign.id,
        ballotreadyPositionId,
        electionDate: campaign.details.electionDate,
        includeTurnout: true,
        officeName: positionName ?? undefined,
      })
      .catch(() => null)

    if (!raceTargetDetails) {
      const result = await this.campaigns.updateJsonFields(campaign.id, {
        pathToVictory: {
          p2vStatus: P2VStatus.failed,
          p2vAttempts: 0,
          officeContextFingerprint: null,
        },
      })
      if (!result)
        throw new NotFoundException('Campaign not found after update')
      return this.withLiveMetrics(result)
    }

    const { projectedTurnout } = raceTargetDetails
    const hasTurnout = projectedTurnout > 0
    const result = await this.campaigns.updateJsonFields(campaign.id, {
      pathToVictory: {
        source: P2VSource.ElectionApi,
        p2vStatus: hasTurnout ? P2VStatus.complete : P2VStatus.districtMatched,
        p2vCompleteDate: new Date().toISOString().slice(0, 10),
        p2vAttempts: 0,
        officeContextFingerprint: null,
      },
    })
    if (!result) throw new NotFoundException('Campaign not found after update')

    return this.withLiveMetrics(result)
  }

  @Put('admin/:slug/race-target-details')
  @Roles(UserRole.admin, UserRole.sales)
  async updateRaceTargetDetailsBySlug(
    @Param('slug') slug: string,
    @Query() query: UpdateRaceTargetDetailsBySlugQueryDTO,
  ) {
    const { includeTurnout } =
      UpdateRaceTargetDetailsBySlugQueryDTO.create(query)
    const campaign = await this.campaigns.findFirstOrThrow({
      where: { slug },
    })
    const { ballotreadyPositionId, positionName } =
      await this.resolveRaceTargetPositionContext(campaign)

    if (!ballotreadyPositionId || !campaign.details.electionDate) {
      throw new BadRequestException(
        `Error: The campaign's organization has no BallotReady position or the campaign has no electionDate — the candidate likely hasn't selected an office yet`,
      )
    }
    const raceTargetDetails = await this.elections
      .getPositionMatchedRaceTargetDetails({
        campaignId: campaign.id,
        ballotreadyPositionId,
        electionDate: campaign.details.electionDate,
        includeTurnout: includeTurnout ?? true,
        officeName: positionName ?? undefined,
      })
      .catch(() => null)

    if (!raceTargetDetails) {
      const result = await this.campaigns.updateJsonFields(campaign.id, {
        pathToVictory: {
          p2vStatus: P2VStatus.failed,
          p2vAttempts: 0,
          officeContextFingerprint: null,
        },
      })
      if (!result)
        throw new NotFoundException('Campaign not found after update')
      return this.withLiveMetrics(result)
    }

    const { projectedTurnout } = raceTargetDetails
    const hasTurnout = projectedTurnout > 0
    const result = await this.campaigns.updateJsonFields(campaign.id, {
      pathToVictory: {
        source: P2VSource.ElectionApi,
        p2vStatus: hasTurnout ? P2VStatus.complete : P2VStatus.districtMatched,
        p2vCompleteDate: new Date().toISOString().slice(0, 10),
        p2vAttempts: 0,
        officeContextFingerprint: null,
      },
    })
    if (!result) throw new NotFoundException('Campaign not found after update')

    return this.withLiveMetrics(result)
  }

  private async withLiveMetrics(
    campaign: CampaignWithPathToVictory,
  ): Promise<CampaignWithPathToVictory> {
    const liveMetrics =
      await this.campaigns.fetchLiveRaceTargetMetrics(campaign)
    if (!liveMetrics) return campaign

    const p2v = campaign.pathToVictory
    if (!p2v) return campaign

    return {
      ...campaign,
      pathToVictory: {
        ...p2v,
        data: { ...(p2v.data ?? {}), ...liveMetrics },
      },
    }
  }

  private async resolveRaceTargetPositionContext(campaign: Campaign) {
    const { organizationSlug } = campaign
    const campaignOrganization = organizationSlug
      ? await this.organizations.findUnique({
          where: { slug: organizationSlug },
        })
      : null
    const { ballotReadyPositionId: ballotreadyPositionId, positionName } =
      await this.organizations.resolvePositionContext({
        customPositionName: campaignOrganization?.customPositionName,
        positionId: campaignOrganization?.positionId,
      })

    return { ballotreadyPositionId, positionName }
  }
}
