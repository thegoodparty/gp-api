import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UsePipes,
} from '@nestjs/common'
import { CampaignsService } from './services/campaigns.service'
import {
  SetDistrictDTO,
  UpdateCampaignSchema,
} from './schemas/updateCampaign.schema'
import { CampaignListSchema } from './schemas/campaignList.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { Campaign, PathToVictory, Prisma, User, UserRole } from '@prisma/client'
import { Roles } from '../authentication/decorators/Roles.decorator'
import { ReqCampaign } from './decorators/ReqCampaign.decorator'
import { UseCampaign } from './decorators/UseCampaign.decorator'
import { userHasRole } from 'src/users/util/users.util'
import { SlackService } from 'src/shared/services/slack.service'
import { buildCampaignListFilters } from './util/buildCampaignListFilters'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { PathToVictoryService } from 'src/pathToVictory/services/pathToVictory.service'
import { P2VStatus } from 'src/elections/types/pathToVictory.types'
import { CreateP2VSchema } from './schemas/createP2V.schema'
import { EnqueuePathToVictoryService } from 'src/pathToVictory/services/enqueuePathToVictory.service'
import { ElectionsService } from 'src/elections/services/elections.service'
import { AnalyticsService } from 'src/analytics/analytics.service'

@Controller('campaigns')
@UsePipes(ZodValidationPipe)
export class CampaignsController {
  private readonly logger = new Logger(CampaignsController.name)

  constructor(
    private readonly campaigns: CampaignsService,
    private readonly planVersions: CampaignPlanVersionsService,
    private readonly slack: SlackService,
    private readonly p2v: PathToVictoryService,
    private readonly enqueuePathToVictory: EnqueuePathToVictoryService,
    private readonly elections: ElectionsService,
    private readonly analytics: AnalyticsService,
  ) {}

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

    p2vStatus === P2VStatus.waiting && this.handleP2VWaiting(campaign, p2v)

    return p2v
  }

  private async handleP2VWaiting(campaign: Campaign, p2v: PathToVictory) {
    if (!p2v.data?.electionType && !p2v.data?.electionLocation) {
      this.enqueuePathToVictory.enqueuePathToVictory(campaign.id)
    }
  }

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
  async create(@ReqUser() user: User) {
    // see if the user already has campaign
    const existing = await this.campaigns.findByUserId(user.id)
    if (existing) {
      throw new ConflictException('User campaign already exists.')
    }
    return await this.campaigns.createForUser(user)
  }

  @Put('mine')
  @UseCampaign({ continueIfNotFound: true })
  async update(
    @ReqUser() user: User,
    @ReqCampaign() campaign: Campaign,
    @Body() { slug, ...body }: UpdateCampaignSchema,
  ) {
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
        this.analytics.identify(campaign.userId, {
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

    this.logger.debug('Updating campaign', campaign, { slug, body })

    return this.campaigns.updateJsonFields(campaign.id, body)
  }

  @Post('launch')
  @UseCampaign()
  @HttpCode(HttpStatus.OK)
  async launch(@ReqUser() user: User, @ReqCampaign() campaign: Campaign) {
    try {
      const launchResult = await this.campaigns.launch(user, campaign)
      return launchResult
    } catch (e) {
      this.logger.error('Error at campaign launch', e)
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

    this.logger.debug('Updating campaign with district', campaign, {
      slug,
      L2DistrictType,
      L2DistrictName,
    })

    const raceTargetDetails = await this.elections.buildRaceTargetDetails({
      L2DistrictType,
      L2DistrictName,
      electionDate: campaign.details?.electionDate || '',
      state: campaign.details?.state || '',
    })

    if (!raceTargetDetails || raceTargetDetails?.projectedTurnout === 0) {
      throw new InternalServerErrorException(
        'Error: An invalid L2District was likely passed to the user and selected by the user',
      )
    }
    return this.campaigns.updateJsonFields(campaign.id, {
      pathToVictory: {
        ...raceTargetDetails,
        electionType: L2DistrictType,
        electionLocation: L2DistrictName,
      },
    })
  }
}
