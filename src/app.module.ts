// biome-ignore-all assist/source/organizeImports: This needs to be organized by hand.
// The wrong import order here can break the startup of the NestJS app.
import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ContentModule } from './content/content.module'
import { JobsModule } from './jobs/jobs.module'
import { HealthModule } from './health/health.module'
import { PrismaModule } from './prisma/prisma.module'
import { ContentfulModule } from './vendors/contentful/contentful.module'
import { DeclareModule } from './declare/declare.module'
import { CampaignsModule } from './campaigns/campaigns.module'
import { AuthenticationModule } from './authentication/authentication.module'
import { UsersModule } from './users/users.module'
import { ElectionsModule } from './elections/elections.module'
import { JwtAuthStrategy } from './authentication/auth-strategies/JwtAuth.strategy'
import { JwtAuthGuard } from './authentication/guards/JwtAuth.guard'
import { AdminAuditInterceptor } from './authentication/interceptors/AdminAudit.interceptor'
import { AdminModule } from './admin/admin.module'
import { QueueConsumerModule } from './queue/consumer/queueConsumer.module'
import { TopIssuesModule } from './topIssues/topIssues.module'
import { SharedModule } from './shared/shared.module'
import { PaymentsModule } from './payments/payments.module'
import { VotersModule } from './voters/voters.module'
import { ErrorLoggerModule } from './errorLogger/errorLogger.module'
import { CrmModule } from './crm/crmModule'
import { SubscribeModule } from './subscribe/subscribe.module'
import { EcanvasserIntegrationModule } from './vendors/ecanvasserIntegration/ecanvasserIntegration.module'
import { OutreachModule } from './outreach/outreach.module'
import { SessionsService } from './users/services/sessions.service'
import { ScheduledMessagingModule } from './scheduled-messaging/scheduled-messaging.module'
import { ScheduleModule } from '@nestjs/schedule'
import { SegmentModule } from './vendors/segment/segment.module'
import { AnalyticsModule } from './analytics/analytics.module'
import { WebsitesModule } from './websites/websites.module'
import { ElectedOfficeModule } from './electedOffice/electedOffice.module'
import { CommunityIssuesModule } from './communityIssues/communityIssues.module'
import { PeerlyModule } from './vendors/peerly/peerly.module'
import { ContactsModule } from './contacts/contacts.module'
import { PollsModule } from './polls/polls.module'
import { FeaturesModule } from './features/features.module'
import { BraintrustModule } from './vendors/braintrust/braintrust.module'

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
    JwtAuthStrategy,
  ],
})
export class AppModule {}
