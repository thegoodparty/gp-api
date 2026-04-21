import {
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
import { Campaign, Organization, User, UserRole } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
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
    private readonly organizationsService: OrganizationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(VoterFileController.name)
  }

  @Get()
  @UseCampaign({
    continueIfNotFound: true,
  })
  @UseGuards(CanDownloadVoterFileGuard)
  async getVoterFile(
    @ReqUser() user: User,
    @ReqCampaign() campaign: Campaign,
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
    @Body()
    {
      outreachId,
      audienceRequest,
      campaignPlanDueDate,
    }: ScheduleOutreachCampaignSchema,
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
      campaignPlanDueDate,
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
  @UseCampaign({ continueIfNotFound: true })
  async canDownload(
    @ReqCampaign()
    campaign?: Campaign,
  ) {
    const district = campaign?.organizationSlug
      ? await this.organizationsService.getDistrictForOrgSlug(
          campaign.organizationSlug,
        )
      : null
    return this.voterFileDownloadAccess.canDownload(campaign, district)
  }

  @Post('filter')
  @UseOrganization()
  async createVoterFileFilter(
    @ReqOrganization() organization: Organization,
    @Body() voterFileFilter: CreateVoterFileFilterSchema,
  ) {
    await this.voterFileFilterService.filterAccessCheck(organization.slug)
    return this.voterFileFilterService.create(
      organization.slug,
      voterFileFilter,
    )
  }

  @Get('filters')
  @UseOrganization()
  listVoterFileFilters(@ReqOrganization() organization: Organization) {
    return this.voterFileFilterService.findByOrganizationSlug(organization.slug)
  }

  @Get('filter/:id')
  @UseOrganization()
  async getVoterFileFilter(
    @Param('id', ParseIntPipe) id: number,
    @ReqOrganization() organization: Organization,
  ) {
    const filter =
      await this.voterFileFilterService.findByIdAndOrganizationSlug(
        id,
        organization.slug,
      )
    if (!filter) {
      throw new NotFoundException('Voter file filter not found')
    }
    return filter
  }

  @Put('filter/:id')
  @UseOrganization()
  async updateVoterFileFilter(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateVoterFileFilterSchema,
    @ReqOrganization() organization: Organization,
  ) {
    await this.voterFileFilterService.filterAccessCheck(organization.slug)
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

  @Delete('filter/:id')
  @UseOrganization()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteVoterFileFilter(
    @Param('id', ParseIntPipe) id: number,
    @ReqOrganization() organization: Organization,
  ) {
    await this.voterFileFilterService.filterAccessCheck(organization.slug)
    await this.voterFileFilterService.deleteByIdAndOrganizationSlug(
      id,
      organization.slug,
    )
  }
}
