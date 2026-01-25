import { Injectable, Logger } from '@nestjs/common'
import { inngest, InngestEvents } from '../inngest.client'

@Injectable()
export class InngestService {
  private readonly logger = new Logger(InngestService.name)

  async sendPollAnalysisComplete(
    data: InngestEvents['polls/analysis.complete']['data'],
  ) {
    this.logger.log(`Sending Inngest event: polls/analysis.complete`)
    return inngest.send({ name: 'polls/analysis.complete', data })
  }

  async sendPollCreated(data: InngestEvents['polls/created']['data']) {
    this.logger.log(`Sending Inngest event: polls/created`)
    return inngest.send({ name: 'polls/created', data })
  }
}
