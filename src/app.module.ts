import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ContentModule } from './content/content.module'
import { JobsModule } from './jobs/jobs.module'
import { HealthModule } from './health/health.module'
import { ContentfulModule } from './contentful/contentful.module'
import { DeclareModule } from './declare/declare.module'
import { CampaignsModule } from './campaigns/campaigns.module'
import { AuthenticationModule } from './authentication/authentication.module'
import { UsersModule } from './users/users.module'
import { AdminModule } from './admin/admin.module'
import { SharedModule } from './shared/shared.module'
import { ConfigModule } from './config/config.module'

@Module({
  imports: [
    ConfigModule,
    SharedModule,
    UsersModule,
    AuthenticationModule,
    ContentModule,
    HealthModule,
    ContentfulModule,
    JobsModule,
    DeclareModule,
    CampaignsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
