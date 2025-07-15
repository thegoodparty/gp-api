import { Body, Controller, Post, UsePipes } from '@nestjs/common'
import { CampaignTcrComplianceService } from './services/campaignTcrCompliance.service'
import { CreateTcrComplianceDto } from './schemas/campaignTcrCompliance.schema'
import { UseCampaign } from '../decorators/UseCampaign.decorator'
import { ReqCampaign } from '../decorators/ReqCampaign.decorator'
import { Campaign } from '@prisma/client'
import { UsersService } from '../../users/services/users.service'
import { ZodValidationPipe } from 'nestjs-zod'

@Controller('campaigns/tcr-compliance')
@UsePipes(ZodValidationPipe)
export class CampaignTcrComplianceController {
  constructor(
    private readonly userService: UsersService,
    private readonly tcrComplianceService: CampaignTcrComplianceService,
  ) {}

  @Post()
  @UseCampaign()
  async createTcrCompliance(
    @ReqCampaign() campaign: Campaign,
    @Body()
    tcrComplianceDto: CreateTcrComplianceDto,
  ) {
    const user = await this.userService.findByCampaign(campaign)
    return this.tcrComplianceService.create(user!, campaign, tcrComplianceDto)
  }
}
