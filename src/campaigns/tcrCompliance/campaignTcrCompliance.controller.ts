import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  Param,
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
    const updatedCampaign = await this.campaignsService.updateJsonFields(
      campaign.id,
      {
        details: {
          einNumber: tcrComplianceDto.ein,
        },
      },
    )
    if (!updatedCampaign) {
      throw new InternalServerErrorException(
        'Failed to update campaign details',
      )
    }

    return this.tcrComplianceService.create(
      user!,
      updatedCampaign,
      tcrComplianceDto,
    )
  }

  @Delete(':id')
  @UseCampaign()
  async deleteTcrCompliance(
    @Param('id') id: string,
    @ReqCampaign() campaign: Campaign,
  ) {
    const tcrCompliance = await this.tcrComplianceService.fetchByCampaignId(
      campaign.id,
    )
    if (!tcrCompliance) {
      throw new NotFoundException(
        'TCR compliance does not exist for this campaign',
      )
    }
    if (tcrCompliance.id !== id) {
      throw new ForbiddenException(
        'TCR compliance ID does not match the campaign ID',
      )
    }
    return this.tcrComplianceService.delete(campaign.id)
  }
}
