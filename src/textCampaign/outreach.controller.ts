import {
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Post,
  UsePipes,
} from '@nestjs/common'
import { OutreachService } from './services/outreach.service'
import { CreateProjectSchema } from './schemas/createProject.schema'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { Campaign } from '@prisma/client'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { ComplianceFormSchema } from './schemas/complianceForm.schema'
import { TcrComplianceStatus } from './types/compliance.types'
import { CompliancePinSchema } from './schemas/compliancePin.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { TcrComplianceService } from './services/tcrCompliance.service'

@Controller('text-campaigns')
@UsePipes(ZodValidationPipe)
export class OutreachController {
  private readonly logger = new Logger(OutreachController.name)

  constructor(
    private readonly textCampaignService: OutreachService,
    private readonly tcrComplianceService: TcrComplianceService,
  ) {}

  @Post()
  @UseCampaign()
  createProject(
    @ReqCampaign() campaign: Campaign,
    @Body() createProjectDto: CreateProjectSchema,
  ) {
    return this.textCampaignService.createProject(campaign.id, createProjectDto)
  }

  @Get()
  @UseCampaign()
  findAll(@ReqCampaign() campaign: Campaign) {
    return this.textCampaignService.findByCampaignId(campaign.id)
  }

  @Post('compliance')
  @UseCampaign()
  async submitComplianceForm(
    @ReqCampaign() campaign: Campaign,
    @Body() body: ComplianceFormSchema,
  ) {
    let submitSuccesful = false
    try {
      this.logger.debug(
        `Submitting compliance form for campaign ${campaign.id}`,
        body,
      )
      await this.textCampaignService.submitComplianceForm(campaign, body)
      submitSuccesful = true
    } catch (e) {
      this.logger.error(
        `Failed to submit compliance form for campaign ${campaign.id}`,
        e,
      )
      submitSuccesful = false
    }
    // need to reload campaign data just in case to avoid stale data
    return this.tcrComplianceService.upsertCompliance(
      campaign.id,
      body,
      submitSuccesful,
    )
  }

  // TODO: to be used for UI to submit pin
  @Post('compliance/pin')
  @UseCampaign()
  async submitCompliancePin(
    @ReqCampaign() campaign: Campaign,
    @Body() { pin }: CompliancePinSchema,
  ) {
    await this.textCampaignService.submitCompliancePin(campaign, pin)
    return await this.tcrComplianceService.updatePin(campaign.id, pin)
  }

  // TODO: to be used for webhook from RumbleUp
  @Post('compliance/approve')
  @PublicAccess()
  async approveCompliance(
    // TODO: what will the payload actually be?
    @Body() body: { campaignId: number; approved: boolean },
  ) {
    const status = body.approved
      ? TcrComplianceStatus.approved
      : TcrComplianceStatus.rejected

    this.logger.debug(
      `Received TCR compliance approval for Campaign: ${body.campaignId}, Status: ${status}`,
    )
    // TODO: how will we know what campaign to update?
    const tcrCompliance = await this.tcrComplianceService.findByCampaignId(
      body.campaignId,
    )

    if (!tcrCompliance) {
      this.logger.error(
        `Cannot find TcrCompliance for campaign ID: ${body.campaignId} to approve compliance`,
      )
      throw new NotFoundException('TcrCompliance not found')
    }

    try {
      await this.tcrComplianceService.updateStatus(body.campaignId, status)
    } catch (e) {
      this.logger.error(
        `Failed to store compliance approval for campaign: ${body.campaignId}, Status: ${status}`,
        e,
      )
      throw e
    }

    return status
  }
}
