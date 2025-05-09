import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UsePipes,
} from '@nestjs/common'
import { OutreachService } from './services/outreach.service'
import { CreateProjectSchema } from './schemas/createProject.schema'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { Campaign, UserRole } from '@prisma/client'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { ComplianceFormSchema } from './schemas/complianceForm.schema'
import { TcrComplianceStatus } from './types/compliance.types'
import { CompliancePinSchema } from './schemas/compliancePin.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { TcrComplianceService } from './services/tcrCompliance.service'
import { Roles } from 'src/authentication/decorators/Roles.decorator'

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
      await this.textCampaignService.submitComplianceForm(campaign, body)
      submitSuccesful = true
    } catch (_e) {
      submitSuccesful = false
    }
    return this.tcrComplianceService.upsertCompliance(
      campaign.id,
      body,
      submitSuccesful
        ? TcrComplianceStatus.submitted
        : TcrComplianceStatus.error,
    )
  }

  @Post('compliance/pin')
  @UseCampaign()
  async submitCompliancePin(
    @ReqCampaign() campaign: Campaign,
    @Body() { pin }: CompliancePinSchema,
  ) {
    let submitSuccesful = false
    try {
      await this.textCampaignService.submitCompliancePin(campaign, pin)
      submitSuccesful = true
    } catch (_e) {
      submitSuccesful = false
    }
    return await this.tcrComplianceService.updatePin(
      campaign.id,
      pin,
      submitSuccesful
        ? TcrComplianceStatus.pending
        : TcrComplianceStatus.submitted,
    )
  }

  // TODO: to be used for webhook from RumbleUp!!!
  // currently used for interim admin UI manual approval
  @Post('compliance/approve')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  async approveCompliance(
    // TODO: update payload to match the RumbleUp webhook payload
    @Body() body: { campaignId: number; approved: boolean },
  ) {
    const status = body.approved
      ? TcrComplianceStatus.approved
      : TcrComplianceStatus.rejected

    this.logger.debug(
      `Received TCR compliance approval for Campaign: ${body.campaignId}, Status: ${status}`,
    )
    // TODO: how will we know what campaign to update?

    try {
      await this.tcrComplianceService.updateStatus(body.campaignId, status)
    } catch (e) {
      this.logger.error(
        `Failed to store compliance approval for campaign: ${body.campaignId}, Status: ${status}`,
        e,
      )
      throw e
    }
  }
}
