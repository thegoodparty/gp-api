import { BadGatewayException, Controller, Get } from '@nestjs/common'
import { QueueProducerService } from './queueProducer.service'
import { QueueMessage, QueueType } from '../queue.types'
import { PinoLogger } from 'nestjs-pino'

@Controller('queue')
export class QueueProducerController {
  constructor(
    private readonly queueService: QueueProducerService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QueueProducerController.name)
  }

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
        this.logger.info(e, `Error at queueController e.message: ${e.message}`)
        throw new BadGatewayException(
          e.message || 'Error occurred while enqueueing message',
        )
      }
    }
  }
}
