import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common'
import { HealthService } from './health.service'

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {
    this.healthService = healthService
  }

  @Get()
  async getHealth() {
    if (await this.healthService.checkHealth()) {
      return 'OK'
    }
    throw new HttpException(
      'HEALTH CHECK FAILED',
      HttpStatus.SERVICE_UNAVAILABLE,
    )
  }
}
