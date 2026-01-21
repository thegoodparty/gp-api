import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { AdminModule } from './admin/admin.module'
import { AnalyticsModule } from './analytics/analytics.module'
import { JwtAuthStrategy } from './authentication/auth-strategies/JwtAuth.strategy'
import { AuthenticationModule } from './authentication/authentication.module'
import { JwtAuthGuard } from './authentication/guards/JwtAuth.guard'
import { AdminAuditInterceptor } from './authentication/interceptors/AdminAudit.interceptor'
import { CampaignsModule } from './campaigns/campaigns.module'
import { CommunityIssuesModule } from './communityIssues/communityIssues.module'
import { ContactsModule } from './contacts/contacts.module'
import { ContentModule } from './content/content.module'
import { CrmModule } from './crm/crmModule'
import { DeclareModule } from './declare/declare.module'
import { ElectedOfficeModule } from './electedOffice/electedOffice.module'
import { ElectionsModule } from './elections/elections.module'
import { ErrorLoggerModule } from './errorLogger/errorLogger.module'
import { FeaturesModule } from './features/features.module'
import { HealthModule } from './health/health.module'
import { JobsModule } from './jobs/jobs.module'
import { BlockedStateInterceptor } from './observability/blockedState/blockedState.interceptor'
import { OutreachModule } from './outreach/outreach.module'
import { PaymentsModule } from './payments/payments.module'
import { PollsModule } from './polls/polls.module'
import { PrismaModule } from './prisma/prisma.module'
import { QueueConsumerModule } from './queue/consumer/queueConsumer.module'
import { ScheduledMessagingModule } from './scheduled-messaging/scheduled-messaging.module'
import { SharedModule } from './shared/shared.module'
import { SubscribeModule } from './subscribe/subscribe.module'
import { TopIssuesModule } from './topIssues/topIssues.module'
import { SessionsService } from './users/services/sessions.service'
import { UsersModule } from './users/users.module'
import { BraintrustModule } from './vendors/braintrust/braintrust.module'
import { ContentfulModule } from './vendors/contentful/contentful.module'
import { EcanvasserIntegrationModule } from './vendors/ecanvasserIntegration/ecanvasserIntegration.module'
import { PeerlyModule } from './vendors/peerly/peerly.module'
import { SegmentModule } from './vendors/segment/segment.module'
import { VotersModule } from './voters/voters.module'
import { WebsitesModule } from './websites/websites.module'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BraintrustModule,
    AnalyticsModule,
    UsersModule,
    FeaturesModule,
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
    ContactsModule,
    PollsModule,
    ElectedOfficeModule,
  ]
    // Today, the QueueConsumerModule can't really work in the unit test environment,
    // because it needs a real SQS queue to work.
    //
    // In the future, we might be able to support testing end-to-end background work
    // with a local mock queue, or https://www.localstack.cloud, or by migrating to a
    // more local-friendly background-work service like e.g. https://www.inngest.com.
    .concat(process.env.NODE_ENV === 'test' ? [] : [QueueConsumerModule]),
  providers: [
    SessionsService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AdminAuditInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: BlockedStateInterceptor,
    },
    JwtAuthStrategy,
  ],
})
export class AppModule {}
