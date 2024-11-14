import { Module } from '@nestjs/common'
import { ContentService } from './content.service'
import { ContentController } from './content.controller'
import { PrismaModule } from 'src/prisma/prisma.module'
import { ContentfulModule } from '../contentful/contentful.module'

@Module({
  controllers: [ContentController],
  providers: [ContentService],
  imports: [PrismaModule, ContentfulModule],
})
export class ContentModule {}
