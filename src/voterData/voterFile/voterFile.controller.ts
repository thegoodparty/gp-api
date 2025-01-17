import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotImplementedException,
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
import { Campaign, User } from '@prisma/client'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { HelpMessageSchema } from './schemas/HelpMessage.schema'

@Controller('voter-data/voter-file')
@UsePipes(ZodValidationPipe)
export class VoterFileController {
  private readonly logger = new Logger(VoterFileController.name)

  constructor(private readonly voterFileService: VoterFileService) {}

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

  @Post('schedule')
  schedule() {
    throw new NotImplementedException()
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
