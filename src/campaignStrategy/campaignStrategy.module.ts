import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { ElectionsModule } from '@/elections/elections.module'
import { AgentExperimentsModule } from '@/agentExperiments/agentExperiments.module'
import { AwsModule } from '@/vendors/aws/aws.module'
import { CampaignStrategyController } from './campaignStrategy.controller'
import { CampaignStrategyService } from './services/campaignStrategy.service'
import { ElectionApiService } from './services/electionApi.service'
import { StrategicLandscapeParamsService } from './services/strategicLandscapeParams.service'
import { StrategicLandscapePersister } from './services/strategicLandscape.persister'

@Module({
  imports: [
    ClerkModule,
    HttpModule,
    ElectionsModule,
    AgentExperimentsModule,
    AwsModule,
  ],
  controllers: [CampaignStrategyController],
  providers: [
    CampaignStrategyService,
    StrategicLandscapePersister,
    ElectionApiService,
    StrategicLandscapeParamsService,
  ],
  exports: [CampaignStrategyService],
})
export class CampaignStrategyModule {}
