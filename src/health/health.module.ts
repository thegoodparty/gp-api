import { Module } from '@nestjs/common'
import { AuthenticationModule } from '../authentication/authentication.module'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'

@Module({
  imports: [AuthenticationModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
