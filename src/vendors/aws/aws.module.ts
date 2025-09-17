import { Module } from '@nestjs/common'
import { AwsS3Service } from './services/awsS3.service'
import { AwsRoute53Service } from './services/awsRoute53.service'

@Module({
  providers: [AwsS3Service, AwsRoute53Service],
  exports: [AwsS3Service, AwsRoute53Service],
})
export class AwsModule {}
