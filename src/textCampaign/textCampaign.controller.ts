import {
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Post,
  UsePipes,
} from '@nestjs/common'
import { TextCampaignService } from './services/textCampaign.service'
import { CreateProjectSchema } from './schemas/createProject.schema'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { Campaign } from '@prisma/client'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { ComplianceFormSchema } from './schemas/complianceForm.schema'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import {
  TcrComplianceInfo,
  TcrComplianceStatus,
} from './types/compliance.types'
import { CompliancePinSchema } from './schemas/compliancePin.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'

@Controller('text-campaigns')
@UsePipes(ZodValidationPipe)
export class TextCampaignController {
  private readonly logger = new Logger(TextCampaignController.name)

  constructor(
    private readonly textCampaignService: TextCampaignService,
    private readonly campaigns: CampaignsService,
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

    // need to reload campaign data just in case to avoid stale data
    const reloadedCampaign = await this.campaigns.findUniqueOrThrow({
      where: { id: campaign.id },
      select: {
        data: true,
      },
    })

    return this.campaigns.update({
      where: { id: campaign.id },
      data: {
        data: {
          ...reloadedCampaign.data,
          tcrComplianceInfo: {
            ...body,
            status: submitSuccesful
              ? TcrComplianceStatus.submitted
              : TcrComplianceStatus.error,
          },
        },
      },
    })
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

    // need to reload campaign data just in case to avoid stale data
    const reloadedCampaign = await this.campaigns.findUniqueOrThrow({
      where: { id: campaign.id },
      select: {
        data: true,
      },
    })

    return this.campaigns.update({
      where: { id: campaign.id },
      data: {
        data: {
          ...reloadedCampaign.data,
          tcrComplianceInfo: {
            ...(reloadedCampaign.data.tcrComplianceInfo as TcrComplianceInfo),
            pin,
            status: submitSuccesful
              ? TcrComplianceStatus.pending
              : TcrComplianceStatus.submitted,
          },
        },
      },
    })
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
    const campaign = await this.campaigns.findUnique({
      where: { id: body.campaignId },
    })

    if (!campaign) {
      this.logger.error(
        `Cannot find campaign with ID: ${body.campaignId} to approve compliance`,
      )
      throw new NotFoundException('Campaign not found')
    }

    try {
      await this.campaigns.update({
        where: { id: body.campaignId },
        data: {
          data: {
            tcrComplianceInfo: {
              ...(campaign.data.tcrComplianceInfo as TcrComplianceInfo),
              status,
            },
          },
        },
      })
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
