import { M2MOnly } from '@/authentication/guards/M2MOnly.guard'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ZodResponseInterceptor } from '@/shared/interceptors/ZodResponse.interceptor'
import { IdParamSchema } from '@/shared/schemas/IdParam.schema'
import { PaginatedResponseSchema } from '@/shared/schemas/PaginatedResponse.schema'
import {
  ListCampaignsPaginationSchema,
  ReadCampaignOutputSchema,
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
import { createZodDto, ZodValidationPipe } from 'nestjs-zod'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { ElectionsService } from 'src/elections/services/elections.service'
import { P2VStatus } from 'src/elections/types/pathToVictory.types'
import { EnqueuePathToVictoryService } from 'src/pathToVictory/services/enqueuePathToVictory.service'
import { PathToVictoryService } from 'src/pathToVictory/services/pathToVictory.service'
import { P2VSource } from 'src/pathToVictory/types/pathToVictory.types'
import { userHasRole } from 'src/users/util/users.util'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { Roles } from '../authentication/decorators/Roles.decorator'
import { ReqCampaign } from './decorators/ReqCampaign.decorator'
import { UseCampaign } from './decorators/UseCampaign.decorator'
import { UpdateRaceTargetDetailsBySlugQueryDTO } from './schemas/adminRaceTargetDetails.schema'
import { CampaignListSchema } from './schemas/campaignList.schema'
import { CreateP2VSchema } from './schemas/createP2V.schema'
import {
  CreateCampaignSchema,
  SetDistrictDTO,
  UpdateCampaignSchema,
} from './schemas/updateCampaign.schema'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { CampaignsService } from './services/campaigns.service'
import { buildCampaignListFilters } from './util/buildCampaignListFilters'
import { PinoLogger } from 'nestjs-pino'

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
    private readonly p2v: PathToVictoryService,
    private readonly enqueuePathToVictory: EnqueuePathToVictoryService,
    private readonly elections: ElectionsService,
    private readonly analytics: AnalyticsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignsController.name)
  }

  // TODO: this is a placeholder, remove once actual implememntation is in place!!!
  @Post('mine/path-to-victory')
  @UseCampaign({ continueIfNotFound: true })
  async createPathToVictory(
    @Body() { slug }: CreateP2VSchema,
    @ReqUser() user: User,
    @ReqCampaign() campaign?: Campaign,
  ) {
    if (
      typeof slug === 'string' &&
      campaign?.slug !== slug &&
      userHasRole(user, [UserRole.admin, UserRole.sales])
    ) {
      // if user has Admin or sales role, allow loading campaign by slug param
      campaign = await this.campaigns.findUniqueOrThrow({
        where: { slug },
      })
    } else if (!campaign) throw new NotFoundException('Campaign not found')

    const name = campaign?.data?.name
    let p2vStatus = P2VStatus.waiting
    if (name && name.toLowerCase().includes('test')) {
      p2vStatus = P2VStatus.complete
    }

    let p2v = await this.p2v.findUnique({ where: { campaignId: campaign.id } })

    if (!p2v) {
      p2v = await this.p2v.create({
        data: {
          campaignId: campaign.id,
          data: { p2vStatus },
        },
      })
    } else {
      await this.p2v.update({
        where: {
          id: p2v.id,
        },
        data: {
          data: { ...p2v.data, p2vStatus, p2vAttempts: 0 },
        },
      })
    }

    if (p2vStatus === P2VStatus.waiting) {
      this.enqueuePathToVictory.enqueuePathToVictory(campaign.id)
    }

    return p2v
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
  @UseCampaign()
  async findMine(@ReqCampaign() campaign: Campaign) {
    return campaign
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
      include: { pathToVictory: true },
    })

    if (!campaign) throw new NotFoundException()

    return campaign
  }

  @Post()
  async create(@ReqUser() user: User, @Body() body: CreateCampaignSchema) {
    const existing = await this.campaigns.findByUserId(user.id)
    if (existing) {
      throw new ConflictException('User campaign already exists.')
    }
    return this.campaigns.createForUser(user, body)
  }

  @Put('mine')
  @UseCampaign({ continueIfNotFound: true })
  async update(
    @ReqUser() user: User,
    @ReqCampaign() campaign: Campaign,
    @Body() { slug, ...body }: UpdateCampaignSchema,
  ) {
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
      // if user has Admin or Sales role, allow loading campaign by slug param
      campaign = await this.campaigns.findFirstOrThrow({
        where: { slug },
      })

      if (body?.details) {
        const { city, office, electionDate, pledged, party } = body.details
        await this.analytics.identify(campaign.userId, {
          ...(city && {
            officeMunicipality: city,
          }),
          ...(office && {
            officeName: office,
          }),
          ...(electionDate && {
            officeElectionDate: electionDate,
          }),
          ...(party && {
            affiliation: party,
          }),
          ...(pledged && {
            pledged,
          }),
        })
      }
    } else if (!campaign) throw new NotFoundException('Campaign not found')

    this.logger.debug({ campaign, ...{ slug, body } }, 'Updating campaign')

    return this.campaigns.updateJsonFields(campaign.id, body)
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
  async launch(@ReqUser() user: User, @ReqCampaign() campaign: Campaign) {
    try {
      const launchResult = await this.campaigns.launch(user, campaign)
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
  async setDistrict(
    @ReqCampaign() campaign: Campaign,
    @ReqUser() user: User,
    @Body() { slug, L2DistrictType, L2DistrictName }: SetDistrictDTO,
  ) {
    if (
      slug &&
      campaign?.slug !== slug &&
      userHasRole(user, [UserRole.admin, UserRole.sales])
    ) {
      // if user has Admin or Sales role, allow loading campaign by slug param
      campaign = await this.campaigns.findFirstOrThrow({
        where: { slug },
      })
    } else if (!campaign) throw new NotFoundException('Campaign not found')

    this.logger.debug(
      {
        campaign,
        ...{
          slug,
          L2DistrictType,
          L2DistrictName,
        },
      },
      'Updating campaign with district',
    )

    const raceTargetDetails = await this.elections.buildRaceTargetDetails({
      L2DistrictType,
      L2DistrictName,
      electionDate: campaign.details?.electionDate || '',
      state: campaign.details?.state || '',
    })

    const hasTurnout =
      !!raceTargetDetails?.projectedTurnout &&
      raceTargetDetails.projectedTurnout > 0
    return this.campaigns.updateJsonFields(campaign.id, {
      pathToVictory: {
        ...(raceTargetDetails || {}),
        electionType: L2DistrictType,
        electionLocation: L2DistrictName,
        districtManuallySet: true,
        ...(!hasTurnout
          ? {
              projectedTurnout: -1,
              winNumber: -1,
              voterContactGoal: -1,
              p2vStatus: P2VStatus.districtMatched,
            }
          : {}),
        // Reset stale silver state when district changes
        p2vAttempts: 0,
        officeContextFingerprint: null,
      },
    })
  }

  @Put('mine/race-target-details')
  @UseCampaign()
  async updateRaceTargetDetails(@ReqCampaign() campaign: Campaign) {
    if (!campaign?.details?.positionId || !campaign.details.electionDate) {
      throw new BadRequestException(
        `Error: The campaign has no ballotready 'positionId' or electionDate and likely hasn't selected an office yet`,
      )
    }

    // Gold flow: look up district + turnout from election-api.
    // If this fails, fall back to silver (LLM-based matching).
    const raceTargetDetails = await this.elections
      .getBallotReadyMatchedRaceTargetDetails({
        campaignId: campaign.id,
        ballotreadyPositionId: campaign.details.positionId,
        electionDate: campaign.details.electionDate,
        includeTurnout: true,
        officeName: campaign.details.otherOffice,
      })
      .catch(() => null)

    if (!raceTargetDetails) {
      // Gold flow failed or returned nothing. Ensure a P2V record exists
      // with Waiting status so silver can attempt district matching.
      const result = await this.campaigns.updateJsonFields(campaign.id, {
        pathToVictory: {
          p2vStatus: P2VStatus.waiting,
          p2vAttempts: 0,
          officeContextFingerprint: null,
        },
      })
      this.enqueuePathToVictory.enqueuePathToVictory(campaign.id)
      return result
    }

    const { district, winNumber, voterContactGoal, projectedTurnout } =
      raceTargetDetails
    const { L2DistrictType, L2DistrictName } = district
    const hasTurnout = projectedTurnout > 0
    const result = await this.campaigns.updateJsonFields(campaign.id, {
      pathToVictory: {
        districtId: district.id,
        electionType: L2DistrictType,
        electionLocation: L2DistrictName,
        // Always write turnout values: real data when available, sentinel -1
        // when district matched but no turnout. This ensures stale turnout
        // from a previous district is cleared.
        winNumber,
        voterContactGoal,
        projectedTurnout,
        source: P2VSource.ElectionApi,
        p2vStatus: hasTurnout ? P2VStatus.complete : P2VStatus.districtMatched,
        p2vCompleteDate: new Date().toISOString().slice(0, 10),
        districtManuallySet: false,
        // Always reset stale silver state when district changes
        p2vAttempts: 0,
        officeContextFingerprint: null,
      },
    })

    return result
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

    if (!campaign?.details?.positionId || !campaign.details.electionDate) {
      throw new BadRequestException(
        `Error: The campaign has no ballotready 'positionId' or electionDate and likely hasn't selected an office yet`,
      )
    }
    // Gold flow: look up district + turnout from election-api.
    // If this fails, fall back to silver (LLM-based matching).
    const raceTargetDetails = await this.elections
      .getBallotReadyMatchedRaceTargetDetails({
        campaignId: campaign.id,
        ballotreadyPositionId: campaign.details.positionId,
        electionDate: campaign.details.electionDate,
        includeTurnout: includeTurnout ?? true,
        officeName: campaign.details.otherOffice,
      })
      .catch(() => null)

    if (!raceTargetDetails) {
      // Gold flow failed or returned nothing. Ensure a P2V record exists
      // with Waiting status so silver can attempt district matching.
      const result = await this.campaigns.updateJsonFields(campaign.id, {
        pathToVictory: {
          p2vStatus: P2VStatus.waiting,
          p2vAttempts: 0,
          officeContextFingerprint: null,
        },
      })
      this.enqueuePathToVictory.enqueuePathToVictory(campaign.id)
      return result
    }

    const { district, winNumber, voterContactGoal, projectedTurnout } =
      raceTargetDetails
    const { L2DistrictType, L2DistrictName } = district
    const hasTurnout = projectedTurnout > 0
    const result = await this.campaigns.updateJsonFields(campaign.id, {
      pathToVictory: {
        districtId: district.id,
        electionType: L2DistrictType,
        electionLocation: L2DistrictName,
        // Always write turnout values: real data when available, sentinel -1
        // when district matched but no turnout. This ensures stale turnout
        // from a previous district is cleared.
        winNumber,
        voterContactGoal,
        projectedTurnout,
        source: P2VSource.ElectionApi,
        p2vStatus: hasTurnout ? P2VStatus.complete : P2VStatus.districtMatched,
        p2vCompleteDate: new Date().toISOString().slice(0, 10),
        districtManuallySet: false,
        // Always reset stale silver state when district changes
        p2vAttempts: 0,
        officeContextFingerprint: null,
      },
    })

    return result
  }
}
