import { Module } from '@nestjs/common'
import { FilesService } from './files.service'
import { AwsModule } from '../aws/aws.module'

@Module({
  imports: [AwsModule],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
