import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common'
import { AnalyticsService } from './analytics.service'

@Controller('integrations')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('analytics-sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async syncAnalyticsUsers() {
    // No need for await here to return immediately
    this.analytics.trackCampaigns()
  }
}
