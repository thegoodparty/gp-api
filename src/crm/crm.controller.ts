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
import { SlackService } from '../shared/services/slack.service'
import { CrmCampaignsService } from '../campaigns/services/crmCampaigns.service'
import { Roles } from '../authentication/decorators/Roles.decorator'
import { UserRole } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  MassRefreshCompanySchema,
  RefreshCompanySchema,
  SyncCampaignSchema,
} from './schemas/RefreshSync.schema'
import { CRMCompanyProperties } from './crm.types'

type HubspotObjectUpdate = {
  objectId: string
  propertyName: string
  propertyValue: string | boolean | number
}

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
  async hubspotWebhook(@Body() payload: HubspotObjectUpdate[]) {
    if (payload && payload.length > 0) {
      for (let i = 0; i < payload.length; i++) {
        const { objectId, propertyName, propertyValue } = payload[i]
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
  async refreshCompanies(@Query() { campaignId }: RefreshCompanySchema) {
    return await this.crmCampaignsService.refreshCompanies(campaignId)
  }

  @Get('mass-refresh-companies')
  @Roles(UserRole.admin)
  async massRefreshCompanies(@Query() { fields }: MassRefreshCompanySchema) {
    return await this.crmCampaignsService.massRefreshCompanies(
      fields as Array<keyof CRMCompanyProperties>,
    )
  }

  @Get('sync')
  @Roles(UserRole.admin)
  async syncCampaign(
    @Query() { campaignId, resync = false }: SyncCampaignSchema,
  ) {
    return await this.crmCampaignsService.syncCampaign(campaignId, resync)
  }
}
