import { Module } from '@nestjs/common'
import { AwsS3Service } from './services/awsS3.service'
import { AwsRoute53Service } from './services/awsRoute53.service'
import { S3Service } from './services/s3.service'

@Module({
  providers: [AwsS3Service, AwsRoute53Service, S3Service],
  exports: [AwsS3Service, AwsRoute53Service, S3Service],
})
export class AwsModule {}
