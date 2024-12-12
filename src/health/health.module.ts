import { Module } from '@nestjs/common'
import { HealthService } from './health.service'
import { HealthController } from './health.controller'

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
