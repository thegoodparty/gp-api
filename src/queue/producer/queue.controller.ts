import { Controller, Get, BadGatewayException, Logger } from '@nestjs/common'
import { EnqueueService } from './enqueue.service'
import { QueueMessage } from '../queue.types'

@Controller('queue')
export class QueueController {
  private readonly logger = new Logger(QueueController.name)
  constructor(private readonly queueService: EnqueueService) {}

  @Get()
  async testQueue() {
    const body: QueueMessage = {
      type: 'generateAiContent',
      data: {
        slug: 'test-slug',
        key: 'test-key',
        regenerate: false,
      },
    }

    try {
      return await this.queueService.sendMessage(body)
    } catch (e) {
      if (e instanceof Error) {
        this.logger.log(`Error at queueController e.message: ${e.message}`, e)
        throw new BadGatewayException(
          e.message || 'Error occurred while enqueueing message',
        )
      }
    }
  }
}
