import { HttpModule } from '@nestjs/axios'
import { Global, Module } from '@nestjs/common'
import { FilesModule } from '@/files/files.module'
import { AuthenticationModule } from '@/authentication/authentication.module'
import { CrmModule } from '@/crm/crmModule'
import { SlackModule } from '@/vendors/slack/slack.module'
import { StripeModule } from '@/vendors/stripe/stripe.module'
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
    SlackModule,
    StripeModule,
  ],
})
export class UsersModule {}
