import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
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
import { FilesInterceptor } from 'src/files/interceptors/files.interceptor'
import { ScheduleOutreachCampaignSchema } from './schemas/ScheduleOutreachCampaign.schema'
import { FileUpload } from 'src/files/files.types'
import { ReqFile } from 'src/files/decorators/ReqFiles.decorator'
import { VoterOutreachService } from '../services/voterOutreach.service'
import { MimeTypes } from 'http-constants-ts'
import { VoterFileDownloadAccessService } from '../../shared/services/voterFileDownloadAccess.service'
import { CampaignTaskType } from 'src/campaigns/tasks/campaignTasks.types'
import { VoterFileType } from './voterFile.types'
import { userHasRole } from 'src/users/util/users.util'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'

export const VOTER_FILE_ROUTE = 'voters/voter-file'

@Controller(VOTER_FILE_ROUTE)
@UsePipes(ZodValidationPipe)
export class VoterFileController {
  private readonly logger = new Logger(VoterFileController.name)

  constructor(
    private readonly voterFileService: VoterFileService,
    private readonly voterOutreachService: VoterOutreachService,
    private readonly voterFileDownloadAccess: VoterFileDownloadAccessService,
    private readonly campaigns: CampaignsService,
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
  @Post('schedule')
  @UseCampaign()
  @UseGuards(CanDownloadVoterFileGuard)
  @UseInterceptors(
    FilesInterceptor('image', {
      mode: 'buffer',
      mimeTypes: [
        MimeTypes.IMAGE_JPEG,
        MimeTypes.IMAGE_GIF,
        MimeTypes.IMAGE_PNG,
      ],
    }),
  )
  scheduleOutreachCampaign(
    @ReqUser() user: User,
    @ReqCampaign() campaign: Campaign,
    @Body() body: ScheduleOutreachCampaignSchema,
    @ReqFile() image?: FileUpload,
  ) {
    const imgRequired =
      body.type === VoterFileType.sms || body.type === CampaignTaskType.text
    if (!image && imgRequired)
      throw new BadRequestException('No image file provided')

    return this.voterOutreachService.scheduleOutreachCampaign(
      user,
      campaign,
      body,
      image,
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
}
