import { forwardRef, Module } from '@nestjs/common'
import { AwsModule } from 'src/vendors/aws/aws.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { AiService } from './ai.service'
import { AreaCodeFromZipService } from './util/areaCodeFromZip.util'
import { OrganizationsModule } from '@/organizations/organizations.module'

@Module({
  imports: [SlackModule, AwsModule, forwardRef(() => OrganizationsModule)],
  providers: [AiService, AreaCodeFromZipService],
  exports: [AiService, AreaCodeFromZipService],
})
export class AiModule {}
