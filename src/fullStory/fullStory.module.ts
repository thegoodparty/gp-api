import { Module } from '@nestjs/common'
import { FullStoryService } from './fullStory.service'
import { HttpModule } from '@nestjs/axios'
import { FullStoryController } from './fullStory.controller'
import { SegmentModule } from 'src/segment/segment.module'

@Module({
  providers: [FullStoryService],
  exports: [FullStoryService],
  imports: [HttpModule, SegmentModule],
  controllers: [FullStoryController],
})
export class FullStoryModule {}
