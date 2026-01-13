import { Module } from '@nestjs/common'
import { ContentfulModule } from '../vendors/contentful/contentful.module'
import { ContentController } from './content.controller'
import { BlogArticleMetaService } from './services/blogArticleMeta.service'
import { ContentService } from './services/content.service'

@Module({
  controllers: [ContentController],
  providers: [ContentService, BlogArticleMetaService],
  imports: [ContentfulModule],
  exports: [ContentService],
})
export class ContentModule {}
