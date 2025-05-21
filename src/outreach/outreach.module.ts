import { Module } from '@nestjs/common'
import { OutreachController } from './outreach.controller'
import { OutreachService } from './services/outreach.service'
import { RumbleUpService } from './services/rumbleUp.service'
import { HttpModule } from '@nestjs/axios'
import { EmailModule } from 'src/email/email.module'
import { TcrComplianceService } from './services/tcrCompliance.service'

@Module({
  imports: [HttpModule, EmailModule],
  controllers: [OutreachController],
  providers: [OutreachService, RumbleUpService, TcrComplianceService],
  exports: [OutreachService],
})
export class OutreachModule {}
