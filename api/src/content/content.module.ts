import { Module } from '@nestjs/common'
import { ContentService } from './content.service'
import { ContentController } from './content.controller'
import { PrismaModule } from '../prisma/prisma.module'
import { ContentfulModule } from '../contentful/contentful.module'
import { PrismaService } from '../prisma/prisma.service'

@Module({
  controllers: [ContentController],
  providers: [ContentService, PrismaService],
  imports: [PrismaModule, ContentfulModule],
})
export class ContentModule {}
