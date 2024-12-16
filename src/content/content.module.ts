import { Module } from '@nestjs/common'
import { ContentService } from './content.service'
import { ContentController } from './content.controller'
import { ContentfulModule } from '../contentful/contentful.module'

@Module({
  controllers: [ContentController],
  providers: [ContentService],
  imports: [ContentfulModule],
  exports: [ContentService],
})
export class ContentModule {}
