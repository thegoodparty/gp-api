import { BadGatewayException, Controller, Get, Logger } from '@nestjs/common'
import { QueueMessage, QueueType } from '../queue.types'
import { QueueProducerService } from './queueProducer.service'

@Controller('queue')
export class QueueProducerController {
  private readonly logger = new Logger(QueueProducerController.name)
  constructor(private readonly queueService: QueueProducerService) {}

  @Get()
  async testQueue() {
    const body: QueueMessage = {
      type: QueueType.GENERATE_AI_CONTENT,
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
