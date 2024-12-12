import { Module } from '@nestjs/common'
import { ContentService } from './content.service'
import { ContentController } from './content.controller'
import { ContentfulModule } from '../contentful/contentful.module'
import { ContentfulService } from 'api/dist/src/contentful/contentful.service'

@Module({
  controllers: [ContentController],
  providers: [ContentService],
  imports: [ContentfulModule, ContentfulService],
})
export class ContentModule {}
