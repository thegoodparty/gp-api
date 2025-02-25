import { Module } from '@nestjs/common'
import { ContentService } from './content.service'
import { ContentController } from './content.controller'
import { ContentfulModule } from '../contentful/contentful.module'
import { BlogArticlesServiceService } from './services/blog-articles.service.service';

@Module({
  controllers: [ContentController],
  providers: [ContentService, BlogArticlesServiceService],
  imports: [ContentfulModule],
  exports: [ContentService],
})
export class ContentModule {}
