import { Module } from '@nestjs/common'
import { AwsModule } from 'src/vendors/aws/aws.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { AiService } from './ai.service'
import { AreaCodeFromZipService } from './util/areaCodeFromZip.util'

@Module({
  imports: [SlackModule, AwsModule],
  providers: [AiService, AreaCodeFromZipService],
  exports: [AiService, AreaCodeFromZipService],
})
export class AiModule {}
