import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common'
import { OutreachService } from './services/outreach.service'
import { CreateOutreachSchema } from './schemas/createOutreachSchema'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { Campaign, UserRole } from '@prisma/client'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { ComplianceFormSchema } from './schemas/complianceForm.schema'
import { TcrComplianceStatus } from './types/compliance.types'
import { CompliancePinSchema } from './schemas/compliancePin.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { TcrComplianceService } from './services/tcrCompliance.service'
import { Roles } from 'src/authentication/decorators/Roles.decorator'

@Controller('outreach')
@UsePipes(ZodValidationPipe)
export class OutreachController {
  private readonly logger = new Logger(OutreachController.name)

  constructor(
    private readonly outreachService: OutreachService,
    private readonly tcrComplianceService: TcrComplianceService,
  ) {}

  @Post()
  @UseCampaign()
  create(
    @ReqCampaign() campaign: Campaign,
    @Body() createProjectDto: CreateOutreachSchema,
  ) {
    if (campaign.id !== createProjectDto.campaignId) {
      throw new UnauthorizedException('Campaign ID mismatch')
    }
    return this.outreachService.create(campaign.id, createProjectDto)
  }

  @Get()
  @UseCampaign()
  findAll(@ReqCampaign() campaign: Campaign) {
    return this.outreachService.findByCampaignId(campaign.id)
  }

  @Post('compliance')
  @UseCampaign()
  async submitComplianceForm(
    @ReqCampaign() campaign: Campaign,
    @Body() body: ComplianceFormSchema,
  ) {
    let submitSuccessful = false
    try {
      await this.outreachService.submitComplianceForm(campaign, body)
      submitSuccessful = true
    } catch (_e) {
      submitSuccessful = false
    }
    return this.tcrComplianceService.upsertCompliance(
      campaign.id,
      body,
      submitSuccessful
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
    let submitSuccessful: boolean
    try {
      await this.outreachService.submitCompliancePin(campaign, pin)
      submitSuccessful = true
    } catch (_e) {
      submitSuccessful = false
    }
    return await this.tcrComplianceService.updatePin(
      campaign.id,
      pin,
      submitSuccessful
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
