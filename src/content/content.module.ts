import { Module } from '@nestjs/common'
import { ContentService } from './services/content.service'
import { ContentController } from './content.controller'
import { ContentfulModule } from '../vendors/contentful/contentful.module'
import { BlogArticleMetaService } from './services/blogArticleMeta.service'

@Module({
  controllers: [ContentController],
  providers: [ContentService, BlogArticleMetaService],
  imports: [ContentfulModule],
  exports: [ContentService],
})
export class ContentModule {}
