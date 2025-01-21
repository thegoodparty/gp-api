import { forwardRef, Module } from '@nestjs/common'
import { FullStoryService } from './fullStory/fullStory.service'
import { HttpModule } from '@nestjs/axios'
import { UsersModule } from '../users/users.module'
import { AwsService } from './aws/aws.service'
import { CampaignsModule } from '../campaigns/campaigns.module'

@Module({
  providers: [FullStoryService, AwsService],
  exports: [FullStoryService, AwsService],
  imports: [forwardRef(() => UsersModule), CampaignsModule, HttpModule],
})
export class IntegrationsModule {}
