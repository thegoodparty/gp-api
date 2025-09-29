import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { SlackService } from '../vendors/slack/services/slack.service'
import { CrmCampaignsService } from '../campaigns/services/crmCampaigns.service'
import { Roles } from '../authentication/decorators/Roles.decorator'
import { UserRole } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  MassRefreshCompanySchema,
  RefreshCompanySchema,
  SyncCampaignSchema,
} from './schemas/RefreshSync.schema'
import { HubSpot } from './crm.types'

@Controller('crm')
@UsePipes(ZodValidationPipe)
export class CrmController {
  logger = new Logger(this.constructor.name)

  constructor(
    private readonly crmCampaignsService: CrmCampaignsService,
    private readonly campaigns: CampaignsService,
    private readonly slack: SlackService,
  ) {}

  @Post('hubspot-webhook')
  @PublicAccess()
  @HttpCode(HttpStatus.OK)
  async hubspotWebhook(@Body() payload: HubSpot.ObjectUpdate[]) {
    // NOTE: this webhook handler assumes that all payloads are "subscriptionType": "company.propertyChange"
    if (payload && payload.length > 0) {
      for (let i = 0; i < payload.length; i++) {
        const {
          objectId,
          propertyName,
          propertyValue,
          changeSource,
          sourceId,
          appId,
        } = payload[i]

        this.logger.debug(
          `CRM Webhook Received: objectId: ${objectId}, key: ${propertyName}, value: ${propertyValue}, changeSource: ${changeSource}, sourceId: ${sourceId}, appId: ${appId}`,
        )

        if (
          // If this webhook call was triggered by a change from us, we don't need to process it
          changeSource === HubSpot.ChangeSource.INTEGRATION &&
          sourceId === String(appId)
        ) {
          this.logger.debug(`CRM Webhook Skipped: change initiated by us`)
          continue
        }

        const campaign = await this.campaigns.findByHubspotId(String(objectId))
        if (!campaign) {
          this.logger.debug(`CRM Webhook Skipped: no campaign found`)
          continue
        }

        try {
          this.crmCampaignsService.handleUpdateCampaign(
            campaign,
            propertyName,
            propertyValue,
          )
          this.logger.debug(
            `CRM Webhook Processed: campaignId: ${campaign.id}, key: ${propertyName}, value: ${propertyValue}`,
          )
        } catch (error) {
          const message = `CRM Webhook Error: objectId: ${objectId}, key: ${propertyName}, value: ${propertyValue}`
          this.logger.error(message, error)
          await this.slack.errorMessage({
            message,
            error,
          })
        }
      }
    }
    return 'ok'
  }

  @Get('companies/:companyId')
  async getCompany(@Param('companyId') companyId: string) {
    return await this.crmCampaignsService.getCrmCompanyById(companyId)
  }

  @Get('refresh-companies')
  @Roles(UserRole.admin) // push from all or one campaign to hubspot
  async refreshCompanies(@Query() { campaignId }: RefreshCompanySchema) {
    return await this.crmCampaignsService.refreshCompanies(campaignId)
  }

  @Get('mass-refresh-companies')
  @Roles(UserRole.admin) // push from all campaigns to hubspot, but only for certain fields
  async massRefreshCompanies(@Query() { fields }: MassRefreshCompanySchema) {
    return await this.crmCampaignsService.massRefreshCompanies(
      fields as Array<HubSpot.OutgoingProperty>,
    )
  }

  @Get('sync') // pull from hubspot to campaign
  @Roles(UserRole.admin)
  async syncCampaign(
    @Query() { campaignId, resync = false }: SyncCampaignSchema,
  ) {
    return await this.crmCampaignsService.syncCampaign(campaignId, resync)
  }
}
