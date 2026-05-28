// OrganizationsModule must load BEFORE ElectionsModule. ElectionsModule
// transitively imports AiModule which uses forwardRef(OrganizationsModule);
// if Organizations starts loading after Elections, the forwardRef resolves
// to undefined during Nest's module scan and bootstrap fails.
import { OrganizationsModule } from '@/organizations/organizations.module'
import { ChatsModule } from '@/chats/chats.module'
import { ElectionsModule } from '@/elections/elections.module'
import { DatabricksSqlProvider } from '@/llm/tools/databricksProvider'
import type { DatabricksProvider } from '@/llm/tools/queryDatabricks.tool'
import {
  TavilySearchProvider,
  type SearchProvider,
} from '@/llm/tools/webSearch.tool'
import { AwsModule } from '@/vendors/aws/aws.module'
import { Module } from '@nestjs/common'
import { BriefingChatsController } from './controllers/briefing-chats.controller'
import {
  BRIEFING_CHATS_DATABRICKS_PROVIDER,
  BRIEFING_CHATS_SEARCH_PROVIDER,
  BriefingChatsService,
} from './services/briefing-chats.service'
import { BriefingArtifactCacheService } from './services/briefingArtifactCache.service'
import { BriefingChatCreateService } from './services/briefingChatCreate.service'
import { BriefingContextService } from './services/briefingContext.service'
import { BriefingNotesService } from './services/briefingNotes.service'
import { DistrictResolverService } from './services/districtResolver.service'

const databricksProviderFactory = (): DatabricksProvider | null => {
  const hostname = process.env.DATABRICKS_SERVER_HOSTNAME
  const httpPath = process.env.DATABRICKS_HTTP_PATH
  const accessToken = process.env.DATABRICKS_API_KEY
  if (!hostname || !httpPath || !accessToken) return null
  return new DatabricksSqlProvider({
    hostname,
    httpPath,
    accessToken,
    catalog: 'goodparty_data_catalog',
    schema: 'dbt',
  })
}

const searchProviderFactory = (): SearchProvider | null => {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return null
  return new TavilySearchProvider({ apiKey })
}

@Module({
  imports: [ChatsModule, AwsModule, OrganizationsModule, ElectionsModule],
  controllers: [BriefingChatsController],
  providers: [
    BriefingChatsService,
    BriefingChatCreateService,
    BriefingContextService,
    BriefingArtifactCacheService,
    BriefingNotesService,
    DistrictResolverService,
    {
      provide: BRIEFING_CHATS_DATABRICKS_PROVIDER,
      useFactory: databricksProviderFactory,
    },
    {
      provide: BRIEFING_CHATS_SEARCH_PROVIDER,
      useFactory: searchProviderFactory,
    },
  ],
  exports: [BriefingChatsService],
})
export class BriefingChatsModule {}
