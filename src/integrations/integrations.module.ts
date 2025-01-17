import { Module } from '@nestjs/common'
import { FullStoryService } from './full-story/fullStory.service'
import { HttpModule } from '@nestjs/axios'
import { UsersModule } from '../users/users.module'

@Module({
  providers: [FullStoryService],
  imports: [UsersModule, HttpModule],
})
export class IntegrationsModule {}
