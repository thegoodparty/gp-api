import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
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
import { Campaign, User } from '@prisma/client'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { HelpMessageSchema } from './schemas/HelpMessage.schema'
import { FilesInterceptor } from 'src/files/interceptors/files.interceptor'
import { ScheduleOutreachCampaignSchema } from './schemas/ScheduleOutreachCampaign.schema'
import { FileUpload } from 'src/files/files.types'
import { ReqFile } from 'src/files/decorators/ReqFiles.decorator'
import { VoterOutreachService } from '../services/voterOutreach.service'
import { MimeTypes } from 'http-constants-ts'

export const VOTER_FILE_ROUTE = 'voter-data/voter-file'

@Controller(VOTER_FILE_ROUTE)
@UsePipes(ZodValidationPipe)
export class VoterFileController {
  private readonly logger = new Logger(VoterFileController.name)

  constructor(
    private readonly voterFileService: VoterFileService,
    private readonly voterOutreachService: VoterOutreachService,
  ) {}

  @Get()
  @UseCampaign({
    include: { pathToVictory: true },
  })
  @UseGuards(CanDownloadVoterFileGuard)
  getVoterFile(
    @ReqCampaign() campaign: CampaignWith<'pathToVictory'>,
    @Query() query: GetVoterFileSchema,
  ) {
    return this.voterFileService.getCsv(campaign, query)
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
    if (!image) throw new BadRequestException('No image file provided')

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
    return this.voterFileService.canDownload(campaign)
  }
}
