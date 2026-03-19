import { Module } from '@nestjs/common'
import { ContentService } from './services/content.service'
import { ContentController } from './content.controller'
import { ContentfulModule } from '../vendors/contentful/contentful.module'

@Module({
  controllers: [ContentController],
  providers: [ContentService],
  imports: [ContentfulModule],
  exports: [ContentService],
})
export class ContentModule {}
