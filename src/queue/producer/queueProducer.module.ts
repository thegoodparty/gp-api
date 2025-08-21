import { Module } from '@nestjs/common'
import { QueueProducerService } from './queueProducer.service'
import { QueueProducerController } from './queueProducer.controller'

@Module({
  controllers: [QueueProducerController],
  providers: [QueueProducerService],
  exports: [QueueProducerService],
})
export class QueueProducerModule {}
