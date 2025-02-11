import { Module } from '@nestjs/common'
import { FullStoryService } from './fullStory.service'
import { HttpModule } from '@nestjs/axios'
import { FullStoryController } from './fullStory.controller'

@Module({
  providers: [FullStoryService],
  exports: [FullStoryService],
  imports: [HttpModule],
  controllers: [FullStoryController],
})
export class FullStoryModule {}
