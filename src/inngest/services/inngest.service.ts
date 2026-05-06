import { Injectable, Logger } from '@nestjs/common'
import { inngest } from '../inngest.client'

@Injectable()
export class InngestService {
  private readonly logger = new Logger(InngestService.name)

  async sendPollCreation(pollId: string) {
    this.logger.log(
      `Sending Inngest event: polls/creation.requested for pollId: ${pollId}`,
    )
    return inngest.send({
      name: 'polls/creation.requested',
      data: { pollId },
    })
  }

  async sendPollExpansion(pollId: string) {
    this.logger.log(
      `Sending Inngest event: polls/expansion.requested for pollId: ${pollId}`,
    )
    return inngest.send({
      name: 'polls/expansion.requested',
      data: { pollId },
    })
  }
}
