import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Post,
  UsePipes,
} from '@nestjs/common'
import { CampaignTcrComplianceService } from './services/campaignTcrCompliance.service'
import { CreateTcrComplianceDto } from './schemas/campaignTcrCompliance.schema'
import { UseCampaign } from '../decorators/UseCampaign.decorator'
import { ReqCampaign } from '../decorators/ReqCampaign.decorator'
import { Campaign } from '@prisma/client'
import { UsersService } from '../../users/services/users.service'
import { ZodValidationPipe } from 'nestjs-zod'
import { CampaignsService } from '../services/campaigns.service'

@Controller('campaigns/tcr-compliance')
@UsePipes(ZodValidationPipe)
export class CampaignTcrComplianceController {
  constructor(
    private readonly userService: UsersService,
    private readonly tcrComplianceService: CampaignTcrComplianceService,
    private readonly campaignsService: CampaignsService,
  ) {}

  @Post()
  @UseCampaign()
  async createTcrCompliance(
    @ReqCampaign() campaign: Campaign,
    @Body()
    tcrComplianceDto: CreateTcrComplianceDto,
  ) {
    if (await this.tcrComplianceService.fetchByCampaignId(campaign.id)) {
      throw new ConflictException(
        'TCR compliance already exists for this campaign',
      )
    }
    const user = await this.userService.findByCampaign(campaign)
    await this.campaignsService.updateJsonFields(campaign.id, {
      details: {
        einNumber: tcrComplianceDto.ein,
      },
    })
    campaign.details.einNumber = tcrComplianceDto.ein
    return this.tcrComplianceService.create(user!, campaign, tcrComplianceDto)
  }

  @Delete(':id')
  @UseCampaign()
  async deleteTcrCompliance(@ReqCampaign() campaign: Campaign) {
    return this.tcrComplianceService.delete(campaign.id)
  }
}
