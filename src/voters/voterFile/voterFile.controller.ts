import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { VoterFileService } from './voterFile.service'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { CanDownloadVoterFileGuard } from './guards/CanDownloadVoterFile.guard'
import { CampaignWith } from 'src/campaigns/campaigns.types'
import { ZodValidationPipe } from 'nestjs-zod'
import { GetVoterFileSchema } from './schemas/GetVoterFile.schema'
import { Campaign, User, UserRole } from '@prisma/client'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { HelpMessageSchema } from './schemas/HelpMessage.schema'
import { ScheduleOutreachCampaignSchema } from './schemas/ScheduleOutreachCampaign.schema'
import { VoterOutreachService } from '../services/voterOutreach.service'
import { VoterFileDownloadAccessService } from '../../shared/services/voterFileDownloadAccess.service'
import { userHasRole } from 'src/users/util/users.util'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { VoterFileFilterService } from '../services/voterFileFilter.service'
import { CreateVoterFileFilterSchema } from '../schemas/CreateVoterFileFilterSchema'
import { OutreachService } from '../../outreach/services/outreach.service'

export const VOTER_FILE_ROUTE = 'voters/voter-file'

@Controller(VOTER_FILE_ROUTE)
@UsePipes(ZodValidationPipe)
export class VoterFileController {
  constructor(
    private readonly voterFileService: VoterFileService,
    private readonly voterOutreachService: VoterOutreachService,
    private readonly voterFileDownloadAccess: VoterFileDownloadAccessService,
    private readonly campaigns: CampaignsService,
    private readonly voterFileFilterService: VoterFileFilterService,
    private readonly outreachService: OutreachService,
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
    @Body() { outreachId }: ScheduleOutreachCampaignSchema,
  ) {
    const outreach = await this.outreachService.model.findUniqueOrThrow({
      where: { id: outreachId },
      include: { voterFileFilter: true },
    })
    return this.voterOutreachService.scheduleOutreachCampaign(
      user,
      campaign,
      outreach,
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
  createVoterFileFilter(
    @ReqCampaign() campaign: Campaign,
    @Body() voterFileFilter: CreateVoterFileFilterSchema,
  ) {
    return this.voterFileFilterService.create(campaign.id, voterFileFilter)
  }
}
