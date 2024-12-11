import {
  Controller,
  Get,
  Param,
  NotFoundException,
  HttpException,
  BadGatewayException,
  Logger,
} from '@nestjs/common'
import { EnqueueService } from './enqueue.service'

@Controller('queue')
export class QueueController {
  private readonly logger = new Logger(EnqueueService.name)
  constructor(private readonly queueService: EnqueueService) {}

  @Get()
  async testQueue() {
    const body: any = {
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
