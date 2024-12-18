import { Module } from '@nestjs/common'
import { HealthService } from './health.service'
import { HealthController } from './health.controller'
import { AuthenticationModule } from '../authentication/authentication.module'

@Module({
  imports: [AuthenticationModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
