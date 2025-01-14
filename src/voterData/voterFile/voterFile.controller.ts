import {
  Controller,
  Get,
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
import { CanDownloadVoterFileGuard } from './guards/canDownloadVoterFile.guard'
import { CampaignWith } from 'src/campaigns/campaigns.types'
import { ZodValidationPipe } from 'nestjs-zod'
import { GetVoterFileSchema } from './schemas/GetVoterFile.schema'

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
    throw new NotImplementedException()
  }

  @Post('schedule')
  schedule() {
    throw new NotImplementedException()
  }

  @Post('help-message')
  helpMessage() {
    throw new NotImplementedException()
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
