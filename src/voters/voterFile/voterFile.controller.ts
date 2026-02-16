import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { Campaign, User, UserRole, VoterFileFilter } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { CampaignWith } from 'src/campaigns/campaigns.types'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
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
import { VOTER_FILE_ROUTE } from './voterFile.constants'
import { VoterFileService } from './voterFile.service'

@Controller(VOTER_FILE_ROUTE)
@UsePipes(ZodValidationPipe)
export class VoterFileController {
  private readonly logger = new Logger(VoterFileController.name)

  constructor(
    private readonly voterFileService: VoterFileService,
    private readonly voterOutreachService: VoterOutreachService,
    private readonly voterFileDownloadAccess: VoterFileDownloadAccessService,
    private readonly campaigns: CampaignsService,
    private readonly voterFileFilterService: VoterFileFilterService,
    private readonly outreachService: OutreachService,
    private readonly electedOfficeService: ElectedOfficeService,
  ) {}

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

    return this.voterFileService.getCsvOrCount(campaign, query)
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
  canDownload(
    @ReqCampaign()
    campaign?: CampaignWith<'pathToVictory'>,
  ) {
    return this.voterFileDownloadAccess.canDownload(campaign)
  }

  @Post('filter')
  @UseCampaign()
  async createVoterFileFilter(
    @ReqCampaign() campaign: Campaign,
    @Body() voterFileFilter: CreateVoterFileFilterSchema,
  ) {
    const electedOffice =
      await this.electedOfficeService.getCurrentElectedOffice(campaign.userId)
    if (!campaign.isPro && !electedOffice) {
      throw new BadRequestException('Campaign is not pro')
    }
    return this.voterFileFilterService.create(campaign.id, voterFileFilter)
  }

  @Get('filters')
  @UseCampaign()
  listVoterFileFilters(@ReqCampaign() campaign: Campaign) {
    return this.voterFileFilterService.findByCampaignId(campaign.id)
  }

  @Get('filter/:id')
  @UseCampaign()
  async getVoterFileFilter(
    @Param('id', ParseIntPipe) id: number,
    @ReqCampaign() campaign: Campaign,
  ) {
    const filter: VoterFileFilter | null =
      await this.voterFileFilterService.findByIdAndCampaignId(id, campaign.id)
    if (!filter) {
      throw new NotFoundException('Voter file filter not found')
    }
    return filter
  }

  @Put('filter/:id')
  @UseCampaign()
  async updateVoterFileFilter(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateVoterFileFilterSchema,
    @ReqCampaign() campaign: Campaign,
  ) {
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
  @UseCampaign()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteVoterFileFilter(
    @Param('id', ParseIntPipe) id: number,
    @ReqCampaign() campaign: Campaign,
  ) {
    await this.voterFileFilterService.deleteByIdAndCampaignId(id, campaign.id)
  }
}
