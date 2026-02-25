import { Controller, Get, Logger, Param, Query, UsePipes } from '@nestjs/common'
import { CrmCampaignsService } from '../campaigns/services/crmCampaigns.service'
import { Roles } from '../authentication/decorators/Roles.decorator'
import { UserRole } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  MassRefreshCompanySchema,
  RefreshCompanySchema,
} from './schemas/RefreshSync.schema'
import { HubSpot } from './crm.types'

@Controller('crm')
@UsePipes(ZodValidationPipe)
export class CrmController {
  logger = new Logger(this.constructor.name)

  constructor(private readonly crmCampaignsService: CrmCampaignsService) {}

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
}
