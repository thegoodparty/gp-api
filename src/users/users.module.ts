import { HttpModule } from '@nestjs/axios'
import { Global, Module } from '@nestjs/common'
import { FilesModule } from '@/files/files.module'
import { AuthenticationModule } from '@/authentication/authentication.module'
import { CrmModule } from '@/crm/crmModule'
import { SlackModule } from '@/vendors/slack/slack.module'
import { StripeModule } from '@/vendors/stripe/stripe.module'
import { ClerkClientProvider } from '@/authentication/providers/clerk-client.provider'
import { CrmUsersService } from './services/crmUsers.service'
import { UserEventsStreamService } from './services/user-events-stream.service'
import { UsersService } from './services/users.service'
import { UserEventsController } from './user-events.controller'
import { UsersController } from './users.controller'

@Global()
@Module({
  controllers: [UsersController, UserEventsController],
  providers: [UsersService, CrmUsersService, UserEventsStreamService, ClerkClientProvider],
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
