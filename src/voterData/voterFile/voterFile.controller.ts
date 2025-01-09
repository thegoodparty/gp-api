import {
  Controller,
  Get,
  Logger,
  NotImplementedException,
  Post,
} from '@nestjs/common'
import { VoterFileService } from './voterFile.service'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { Campaign, Prisma, User } from '@prisma/client'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'

@Controller('voter-data/voter-file')
export class VoterFileController {
  private readonly logger = new Logger(VoterFileController.name)

  constructor(private readonly voterFileService: VoterFileService) {}

  @Get()
  getVoterFile() {
    throw new NotImplementedException()
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
    campaign: Prisma.CampaignGetPayload<{ include: { pathToVictory: true } }>,
  ) {
    return this.voterFileService.canDownload(campaign)
  }
}
