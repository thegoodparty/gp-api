import { Module } from '@nestjs/common'
import { AwsRoute53Service } from './services/awsRoute53.service'
import { S3Service } from './services/s3.service'

@Module({
  providers: [AwsRoute53Service, S3Service],
  exports: [AwsRoute53Service, S3Service],
})
export class AwsModule {}
