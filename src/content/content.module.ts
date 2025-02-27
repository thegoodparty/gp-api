import { Module } from '@nestjs/common'
import { ContentService } from './content.service'
import { ContentController } from './content.controller'
import { ContentfulModule } from '../contentful/contentful.module'
import { BlogArticleMetaService } from './services/blogArticleMeta.service'
import { CacheModule } from '@nestjs/cache-manager'

@Module({
  controllers: [ContentController],
  providers: [ContentService, BlogArticleMetaService],
  imports: [ContentfulModule, CacheModule.register()],
  exports: [ContentService],
})
export class ContentModule {}
