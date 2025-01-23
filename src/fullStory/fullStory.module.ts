import { forwardRef, Module } from '@nestjs/common'
import { FullStoryService } from './fullStory.service'
import { HttpModule } from '@nestjs/axios'
import { UsersModule } from '../users/users.module'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { FullStoryController } from './fullStory.controller'

@Module({
  providers: [FullStoryService],
  exports: [FullStoryService],
  imports: [forwardRef(() => UsersModule), CampaignsModule, HttpModule],
  controllers: [FullStoryController],
})
export class FullStoryModule {}
