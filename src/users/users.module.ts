import { forwardRef, Module } from '@nestjs/common'
import { UsersService } from './services/users.service'
import { UsersController } from './users.controller'
import { FilesModule } from 'src/files/files.module'
import { FullStoryModule } from '../fullStory/fullStory.module'
import { AuthenticationModule } from '../authentication/authentication.module'
import { CrmModule } from '../crm/crmModule'
import { CrmUsersService } from './services/crmUsers.service'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { HttpModule } from '@nestjs/axios'

@Module({
  controllers: [UsersController],
  providers: [UsersService, CrmUsersService],
  exports: [UsersService, CrmUsersService],
  imports: [
    CampaignsModule,
    FilesModule,
    FullStoryModule,
    forwardRef(() => AuthenticationModule),
    CrmModule,
    HttpModule,
  ],
})
export class UsersModule {}
