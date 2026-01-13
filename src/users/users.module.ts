import { HttpModule } from '@nestjs/axios'
import { Global, Module } from '@nestjs/common'
import { FilesModule } from 'src/files/files.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { StripeModule } from 'src/vendors/stripe/stripe.module'
import { AnalyticsModule } from '../analytics/analytics.module'
import { AuthenticationModule } from '../authentication/authentication.module'
import { CrmModule } from '../crm/crmModule'
import { CrmUsersService } from './services/crmUsers.service'
import { UsersService } from './services/users.service'
import { UsersController } from './users.controller'

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
    StripeModule,
  ],
})
export class UsersModule {}
