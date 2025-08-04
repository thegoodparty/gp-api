import { Controller } from '@nestjs/common'
import { AnalyticsService } from './analytics.service'

@Controller('integrations')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
}
