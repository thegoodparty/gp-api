import { Global, Module } from '@nestjs/common'
import { UsersService } from './services/users.service'
import { UsersController } from './users.controller'
import { FilesModule } from 'src/files/files.module'
import { AnalyticsModule } from '../analytics/analytics.module'
import { AuthenticationModule } from '../authentication/authentication.module'
import { CrmModule } from '../crm/crmModule'
import { CrmUsersService } from './services/crmUsers.service'
import { HttpModule } from '@nestjs/axios'

@Global()
@Module({
  controllers: [UsersController],
  providers: [UsersService, CrmUsersService],
  exports: [UsersService, CrmUsersService],
  imports: [
    FilesModule,
    AnalyticsModule,
    AuthenticationModule,
    CrmModule,
    HttpModule,
  ],
})
export class UsersModule {}
