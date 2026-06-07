import { Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { EmailService } from 'src/email/email.service'
import { Campaign, User } from 'src/generated/prisma'
import { CampaignsService } from '../services/campaigns.service'
import { renderFilingInstructionsEmail } from './filingInstructions.util'

@Injectable()
export class FilingInstructionsService {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly email: EmailService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FilingInstructionsService.name)
  }

  async emailToCandidate(campaign: Campaign, user: User) {
    const metrics = await this.campaigns.fetchLiveRaceTargetMetrics(campaign)
    const message = renderFilingInstructionsEmail(campaign, metrics)
    return this.email.sendEmail({
      to: user.email,
      subject: 'Your filing instructions - GoodParty.org',
      message,
    })
  }
}
