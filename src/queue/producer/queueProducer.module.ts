import { Module } from '@nestjs/common'
import { QueueProducerController } from './queueProducer.controller'
import { QueueProducerService } from './queueProducer.service'

@Module({
  controllers: [QueueProducerController],
  providers: [QueueProducerService],
  exports: [QueueProducerService],
})
export class QueueProducerModule {}
