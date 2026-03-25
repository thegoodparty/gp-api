import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import {
  Campaign,
  Organization,
  User,
  UserRole,
  VoterFileFilter,
} from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { CampaignWith } from 'src/campaigns/campaigns.types'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import { ReqOrganization } from 'src/organizations/decorators/ReqOrganization.decorator'
import { UseOrganization } from 'src/organizations/decorators/UseOrganization.decorator'
import { OrganizationsService } from 'src/organizations/services/organizations.service'
import { userHasRole } from 'src/users/util/users.util'
import { OutreachService } from '../../outreach/services/outreach.service'
import { VoterFileDownloadAccessService } from '../../shared/services/voterFileDownloadAccess.service'
import { CreateVoterFileFilterSchema } from '../schemas/CreateVoterFileFilterSchema'
import { UpdateVoterFileFilterSchema } from '../schemas/UpdateVoterFileFilterSchema'
import { VoterFileFilterService } from '../services/voterFileFilter.service'
import { VoterOutreachService } from '../services/voterOutreach.service'
import { CanDownloadVoterFileGuard } from './guards/CanDownloadVoterFile.guard'
import { GetVoterFileSchema } from './schemas/GetVoterFile.schema'
import { HelpMessageSchema } from './schemas/HelpMessage.schema'
import { ScheduleOutreachCampaignSchema } from './schemas/ScheduleOutreachCampaign.schema'
import { VoterFileService } from './voterFile.service'
import { PinoLogger } from 'nestjs-pino'

@Controller('voters/voter-file')
@UsePipes(ZodValidationPipe)
export class VoterFileController {
  constructor(
    private readonly voterFileService: VoterFileService,
    private readonly voterOutreachService: VoterOutreachService,
    private readonly voterFileDownloadAccess: VoterFileDownloadAccessService,
    private readonly campaigns: CampaignsService,
    private readonly voterFileFilterService: VoterFileFilterService,
    private readonly outreachService: OutreachService,
    private readonly electedOfficeService: ElectedOfficeService,
    private readonly organizationsService: OrganizationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(VoterFileController.name)
  }

  @Get()
  @UseCampaign({
    include: { pathToVictory: true },
    continueIfNotFound: true,
  })
  @UseGuards(CanDownloadVoterFileGuard)
  async getVoterFile(
    @ReqUser() user: User,
    @ReqCampaign() campaign: CampaignWith<'pathToVictory'>,
    @Query() { slug, ...query }: GetVoterFileSchema,
  ) {
    if (typeof slug === 'string' && campaign?.slug !== slug) {
      if (!userHasRole(user, [UserRole.admin])) {
        throw new ForbiddenException(
          'You are not authorized to access this campaign',
        )
      }

      campaign = await this.campaigns.findFirstOrThrow({
        where: { slug },
        include: { pathToVictory: true },
      })
    } else if (!campaign) throw new NotFoundException('Campaign not found')

    const district = campaign.organizationSlug
      ? await this.organizationsService.getDistrictForOrgSlug(
          campaign.organizationSlug,
        )
      : null
    return this.voterFileService.getCsvOrCount(campaign, query, district)
  }

  @Get('wake-up')
  wakeUp() {
    return this.voterFileService.wakeUp()
  }

  // TODO: this should maybe live alongside future campaign planning feature
  //  UPDATE: yes, it should. Move it to the OutreachController
  @Post('schedule')
  @UseCampaign()
  @UseGuards(CanDownloadVoterFileGuard)
  async scheduleOutreachCampaign(
    @ReqUser() user: User,
    @ReqCampaign() campaign: Campaign,
    @Body() { outreachId, audienceRequest }: ScheduleOutreachCampaignSchema,
  ) {
    const outreach = await this.outreachService.model.findFirst({
      where: { id: outreachId, campaignId: campaign.id },
      include: { voterFileFilter: true },
    })
    if (!outreach) {
      this.logger.warn(
        `Outreach not found for schedule: outreachId=${outreachId}, campaignId=${campaign.id}. Ensure the client uses the outreach id from the POST /outreach 201 response.`,
      )
      throw new NotFoundException('Outreach not found')
    }
    return this.voterOutreachService.scheduleOutreachCampaign(
      user,
      campaign,
      outreach,
      audienceRequest,
    )
  }

  @Post('help-message')
  @UseCampaign()
  @UseGuards(CanDownloadVoterFileGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  helpMessage(
    @ReqUser() user: User,
    @ReqCampaign() campaign: Campaign,
    @Body() body: HelpMessageSchema,
  ) {
    return this.voterFileService.helpMessage(user, campaign, body)
  }

  @Get('can-download')
  @UseCampaign({ include: { pathToVictory: true }, continueIfNotFound: true })
  async canDownload(
    @ReqCampaign()
    campaign?: CampaignWith<'pathToVictory'>,
  ) {
    const district = campaign?.organizationSlug
      ? await this.organizationsService.getDistrictForOrgSlug(
          campaign.organizationSlug,
        )
      : null
    return this.voterFileDownloadAccess.canDownload(campaign, district)
  }

  @Post('filter')
  @UseCampaign({ continueIfNotFound: true })
  @UseOrganization({ continueIfNotFound: true })
  async createVoterFileFilter(
    @ReqCampaign() campaign: Campaign | undefined,
    @ReqOrganization() organization: Organization | undefined,
    @Body() voterFileFilter: CreateVoterFileFilterSchema,
  ) {
    if (organization) {
      const electedOffice = await this.electedOfficeService.findFirst({
        where: { organizationSlug: organization.slug },
      })
      if (!(campaign?.isPro ?? false) && !electedOffice) {
        throw new BadRequestException('Campaign is not pro')
      }
      return this.voterFileFilterService.create(
        campaign?.id,
        organization.slug,
        voterFileFilter,
      )
    }

    if (!campaign) {
      throw new BadRequestException('Campaign or organization is required')
    }

    const electedOffice =
      await this.electedOfficeService.getCurrentElectedOffice(campaign.userId)
    if (!campaign.isPro && !electedOffice) {
      throw new BadRequestException('Campaign is not pro')
    }
    if (!campaign.organizationSlug) {
      throw new BadRequestException('Campaign has no organization')
    }
    const campaignFilter = await this.voterFileFilterService.create(
      campaign.id,
      campaign.organizationSlug,
      voterFileFilter,
    )
    if (electedOffice?.organizationSlug) {
      await this.voterFileFilterService.create(
        campaign.id,
        electedOffice.organizationSlug,
        voterFileFilter,
      )
    }
    return campaignFilter
  }

  @Get('filters')
  @UseCampaign({ continueIfNotFound: true })
  @UseOrganization({ continueIfNotFound: true })
  listVoterFileFilters(
    @ReqCampaign() campaign: Campaign | undefined,
    @ReqOrganization() organization: Organization | undefined,
  ) {
    if (organization) {
      return this.voterFileFilterService.findByOrganizationSlug(
        organization.slug,
      )
    }
    if (!campaign) {
      throw new BadRequestException('Campaign or organization is required')
    }
    return this.voterFileFilterService.findByCampaignId(campaign.id)
  }

  @Get('filter/:id')
  @UseCampaign({ continueIfNotFound: true })
  @UseOrganization({ continueIfNotFound: true })
  async getVoterFileFilter(
    @Param('id', ParseIntPipe) id: number,
    @ReqCampaign() campaign: Campaign | undefined,
    @ReqOrganization() organization: Organization | undefined,
  ) {
    const filter: VoterFileFilter | null = organization
      ? await this.voterFileFilterService.findByIdAndOrganizationSlug(
          id,
          organization.slug,
        )
      : campaign
        ? await this.voterFileFilterService.findByIdAndCampaignId(
            id,
            campaign.id,
          )
        : null
    if (!filter) {
      throw new NotFoundException('Voter file filter not found')
    }
    return filter
  }

  @Put('filter/:id')
  @UseCampaign({ continueIfNotFound: true })
  @UseOrganization({ continueIfNotFound: true })
  async updateVoterFileFilter(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateVoterFileFilterSchema,
    @ReqCampaign() campaign: Campaign | undefined,
    @ReqOrganization() organization: Organization | undefined,
  ) {
    if (organization) {
      const electedOffice = await this.electedOfficeService.findFirst({
        where: { organizationSlug: organization.slug },
      })
      if (!(campaign?.isPro ?? false) && !electedOffice) {
        throw new BadRequestException('Campaign is not pro')
      }
      const filter =
        await this.voterFileFilterService.findByIdAndOrganizationSlug(
          id,
          organization.slug,
        )
      if (!filter) {
        throw new NotFoundException('Voter file filter not found')
      }
      return this.voterFileFilterService.updateByIdAndOrganizationSlug(
        id,
        organization.slug,
        body,
      )
    }

    if (!campaign) {
      throw new BadRequestException('Campaign or organization is required')
    }

    const electedOffice =
      await this.electedOfficeService.getCurrentElectedOffice(campaign.userId)
    if (!campaign.isPro && !electedOffice) {
      throw new BadRequestException('Campaign is not pro')
    }
    const filter: VoterFileFilter | null =
      await this.voterFileFilterService.findByIdAndCampaignId(id, campaign.id)
    if (!filter) {
      throw new NotFoundException('Voter file filter not found')
    }
    return this.voterFileFilterService.updateByIdAndCampaignId(
      id,
      campaign.id,
      body,
    )
  }

  @Delete('filter/:id')
  @UseCampaign({ continueIfNotFound: true })
  @UseOrganization({ continueIfNotFound: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteVoterFileFilter(
    @Param('id', ParseIntPipe) id: number,
    @ReqCampaign() campaign: Campaign | undefined,
    @ReqOrganization() organization: Organization | undefined,
  ) {
    if (organization) {
      const electedOffice = await this.electedOfficeService.findFirst({
        where: { organizationSlug: organization.slug },
      })
      if (!(campaign?.isPro ?? false) && !electedOffice) {
        throw new BadRequestException('Campaign is not pro')
      }
      await this.voterFileFilterService.deleteByIdAndOrganizationSlug(
        id,
        organization.slug,
      )
      return
    }

    if (!campaign) {
      throw new BadRequestException('Campaign or organization is required')
    }

    const electedOffice =
      await this.electedOfficeService.getCurrentElectedOffice(campaign.userId)
    if (!campaign.isPro && !electedOffice) {
      throw new BadRequestException('Campaign is not pro')
    }
    await this.voterFileFilterService.deleteByIdAndCampaignId(id, campaign.id)
  }
}
