import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ContentModule } from './content/content.module'
import { JobsModule } from './jobs/jobs.module'
import { HealthModule } from './health/health.module'
import { PrismaModule } from './prisma/prisma.module'
import { ContentfulModule } from './contentful/contentful.module'
import { DeclareModule } from './declare/declare.module'
import { CampaignsModule } from './campaigns/campaigns.module'
import { AuthenticationModule } from './authentication/authentication.module'
import { UsersModule } from './users/users.module'
import { JwtAuthStrategy } from './authentication/auth-strategies/JwtAuth.strategy'
import { APP_GUARD } from '@nestjs/core'
import { JwtAuthGuard } from './authentication/guards/JwtAuth.guard'
import { TopIssuesModule } from './topIssues/topIssues.module'
import { AdminModule } from './admin/admin.module'

@Module({
  imports: [
    UsersModule,
    AuthenticationModule,
    ContentModule,
    HealthModule,
    PrismaModule,
    ContentfulModule,
    JobsModule,
    DeclareModule,
    CampaignsModule,
    TopIssuesModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    JwtAuthStrategy,
  ],
})
export class AppModule {}
