import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'
import { HealthService } from './health.service'

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {
    this.healthService = healthService
  }

  @PublicAccess()
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
