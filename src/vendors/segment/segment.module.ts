import { Module } from '@nestjs/common'
import { SegmentService } from './segment.service'

@Module({
  providers: [SegmentService],
  exports: [SegmentService],
})
export class SegmentModule {}
