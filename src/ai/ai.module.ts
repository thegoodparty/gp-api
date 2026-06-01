import { Module } from '@nestjs/common'
import { AwsModule } from 'src/vendors/aws/aws.module'
import { LlmModule } from '@/llm/llm.module'
import { OrganizationsModule } from '@/organizations/organizations.module'
import { PromptReplaceService } from './services/promptReplace.service'
import { AreaCodeFromZipService } from './util/areaCodeFromZip.util'

@Module({
  imports: [AwsModule, LlmModule, OrganizationsModule],
  providers: [PromptReplaceService, AreaCodeFromZipService],
  exports: [PromptReplaceService, AreaCodeFromZipService],
})
export class AiModule {}
