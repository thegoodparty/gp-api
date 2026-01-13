import { Module } from '@nestjs/common'
import { AwsModule } from '../vendors/aws/aws.module'
import { FilesService } from './files.service'

@Module({
  imports: [AwsModule],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
