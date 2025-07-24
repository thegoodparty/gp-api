import { Global, Module } from '@nestjs/common'
import { UsersService } from './services/users.service'
import { UsersController } from './users.controller'
import { PublicUsersController } from './controllers/public-users.controller'
import { PublicUsersService } from './services/public-users.service'
import { FilesModule } from 'src/files/files.module'
import { AuthenticationModule } from '../authentication/authentication.module'
import { CrmModule } from '../crm/crmModule'
import { CrmUsersService } from './services/crmUsers.service'
import { HttpModule } from '@nestjs/axios'
import { AnalyticsModule } from '../analytics/analytics.module'

@Global()
@Module({
  controllers: [UsersController, PublicUsersController],
  providers: [UsersService, CrmUsersService, PublicUsersService],
  exports: [UsersService, CrmUsersService, PublicUsersService],
  imports: [
    FilesModule,
    AuthenticationModule,
    CrmModule,
    HttpModule,
    AnalyticsModule,
  ],
})
export class UsersModule {}
