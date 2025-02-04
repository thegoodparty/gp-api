import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { SlackService } from '../shared/services/slack.service'
import { CrmCampaignsService } from './crmCampaigns.service'
import { Roles } from '../authentication/decorators/Roles.decorator'
import { UserRole } from '@prisma/client'

type HubspotObjectUpdate = {
  objectId: string
  propertyName: string
  propertyValue: string | boolean | number
}

@Controller('crm')
export class CrmController {
  logger = new Logger(this.constructor.name)
  constructor(
    private readonly crmCampaignsService: CrmCampaignsService,
    private readonly campaigns: CampaignsService,
    private readonly slack: SlackService,
  ) {}

  @Post('hubspot-webhook')
  @PublicAccess()
  async hubspotWebhook(@Body() payload: HubspotObjectUpdate[]) {
    if (payload && payload.length > 0) {
      for (let i = 0; i < payload.length; i++) {
        let { objectId, propertyName, propertyValue } = payload[i]
        const campaign = await this.campaigns.findByHubspotId(objectId)
        if (!campaign) {
          continue
        }

        try {
          if (propertyName === 'incumbent' || propertyName === 'opponents') {
            this.crmCampaignsService.handleUpdateViability(
              campaign,
              propertyName,
              propertyValue,
            )
          } else {
            this.crmCampaignsService.handleUpdateCampaign(
              campaign,
              propertyName,
              propertyValue,
            )
          }
        } catch (error) {
          const message = 'error at crm/hubspot-webhook'
          this.logger.error(message, error)
          this.slack.errorMessage({
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
  @Roles(UserRole.admin)
  async refreshCompanies(@Query('campaignId') campaignId: number) {
    return await this.crmCampaignsService.refreshCompanies(campaignId)
  }

  @Get('sync')
  @Roles(UserRole.admin)
  async syncCampaign(
    @Query('campaignId') campaignId: number,
    @Query('resync') resync: boolean = false,
  ) {
    return await this.crmCampaignsService.syncCampaign(campaignId, resync)
  }
}
