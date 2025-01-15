import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
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
import { RacesModule } from './races/races.module'
import { JwtAuthStrategy } from './authentication/auth-strategies/JwtAuth.strategy'
import { JwtAuthGuard } from './authentication/guards/JwtAuth.guard'
import { AdminModule } from './admin/admin.module'
import { QueueConsumerModule } from './queue/consumer/consumer.module'
import { TopIssuesModule } from './topIssues/topIssues.module'
import { SharedModule } from './shared/shared.module'
import { GraphqlModule } from './graphql/graphql.module'
import { PaymentsModule } from './payments/payments.module'
import { ErrorLoggerModule } from './error-logger/error-logger.module'
import { VoterDataModule } from './voterData/voterData.module'

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
    RacesModule,
    TopIssuesModule,
    AdminModule,
    QueueConsumerModule,
    SharedModule,
    GraphqlModule,
    PaymentsModule,
    ErrorLoggerModule,
    VoterDataModule,
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
