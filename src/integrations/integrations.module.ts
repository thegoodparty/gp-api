import { forwardRef, Module } from '@nestjs/common'
import { FullStoryService } from './fullStory/fullStory.service'
import { HttpModule } from '@nestjs/axios'
import { UsersModule } from '../users/users.module'
import { AwsService } from './aws/aws.service'

@Module({
  providers: [FullStoryService, AwsService],
  exports: [FullStoryService, AwsService],
  imports: [forwardRef(() => UsersModule), HttpModule],
})
export class IntegrationsModule {}
