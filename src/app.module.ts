import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ContentModule } from './content/content.module'
import { JobsModule } from './jobs/jobs.module'
import { HealthModule } from './health/health.module'
import { PrismaModule } from './prisma/prisma.module'
import { ContentfulModule } from './contentful/contentful.module'
import { DeclareModule } from './declare/declare.module'
import { CampaignsModule } from './campaigns/campaigns.module'
import { AuthenticationModule } from './authentication/authentication.module'
import { UsersModule } from './users/users.module'
import { ElectionsModule } from './elections/elections.module'
import { JwtAuthStrategy } from './authentication/auth-strategies/JwtAuth.strategy'
import { JwtAuthGuard } from './authentication/guards/JwtAuth.guard'
import { AdminModule } from './admin/admin.module'
import { QueueConsumerModule } from './queue/consumer/consumer.module'
import { TopIssuesModule } from './topIssues/topIssues.module'
import { SharedModule } from './shared/shared.module'
import { PaymentsModule } from './payments/payments.module'
import { VotersModule } from './voters/voters.module'
import { ErrorLoggerModule } from './errorLogger/errorLogger.module'
import { CrmModule } from './crm/crmModule'
import { SubscribeModule } from './subscribe/subscribe.module'
import { EcanvasserIntegrationModule } from './ecanvasserIntegration/ecanvasserIntegration.module'
import { OutreachModule } from './outreach/outreach.module'
import { SessionsService } from './users/services/sessions.service'
import { ScheduledMessagingModule } from './scheduled-messaging/scheduled-messaging.module'
import { ScheduleModule } from '@nestjs/schedule'
import { SegmentModule } from './segment/segment.module'
import { AnalyticsModule } from './analytics/analytics.module'
import { WebsitesModule } from './websites/websites.module'
import { CommunityIssuesModule } from './communityIssues/communityIssues.module'
import { PeerlyModule } from './peerly/peerly.module'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AnalyticsModule,
    UsersModule,
    AuthenticationModule,
    ContentModule,
    HealthModule,
    PrismaModule,
    ContentfulModule,
    JobsModule,
    DeclareModule,
    CampaignsModule,
    ElectionsModule,
    TopIssuesModule,
    AdminModule,
    QueueConsumerModule,
    SharedModule,
    PaymentsModule,
    VotersModule,
    ErrorLoggerModule,
    CrmModule,
    SubscribeModule,
    EcanvasserIntegrationModule,
    ScheduledMessagingModule,
    OutreachModule,
    SegmentModule,
    WebsitesModule,
    CommunityIssuesModule,
    PeerlyModule,
  ],
  providers: [
    SessionsService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    JwtAuthStrategy,
  ],
})
export class AppModule {}
