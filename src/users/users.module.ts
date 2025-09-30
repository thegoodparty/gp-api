import { Global, Module } from '@nestjs/common'
import { UsersService } from './services/users.service'
import { UsersController } from './users.controller'
import { FilesModule } from 'src/files/files.module'
import { AuthenticationModule } from '../authentication/authentication.module'
import { CrmModule } from '../crm/crmModule'
import { CrmUsersService } from './services/crmUsers.service'
import { HttpModule } from '@nestjs/axios'
import { AnalyticsModule } from '../analytics/analytics.module'
import { SlackModule } from 'src/vendors/slack/slack.module'

@Global()
@Module({
  controllers: [UsersController],
  providers: [UsersService, CrmUsersService],
  exports: [UsersService, CrmUsersService],
  imports: [
    FilesModule,
    AuthenticationModule,
    CrmModule,
    HttpModule,
    AnalyticsModule,
    SlackModule,
  ],
})
export class UsersModule {}
