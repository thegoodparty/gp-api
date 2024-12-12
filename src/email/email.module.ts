import { Module } from '@nestjs/common'
import { EmailService } from './email.service'
import { MailgunService } from './mailgun.service'

@Module({
  providers: [EmailService, MailgunService],
  exports: [EmailService],
})
export class EmailModule {}
