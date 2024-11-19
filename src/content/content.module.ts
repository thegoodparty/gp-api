import { Module } from '@nestjs/common'
import { ContentService } from './content.service'
import { ContentController } from './content.controller'
import { PrismaModule } from 'src/prisma/prisma.module'
import { ContentfulModule } from '../contentful/contentful.module'
import { Content } from '@prisma/client'

export type ContentRaw<T extends object = {}> = Content & { data: object } & T
export type ContentAugmented<T extends object = {}> = T
export type Transformer = (content: Content) => ContentAugmented

@Module({
  controllers: [ContentController],
  providers: [ContentService],
  imports: [PrismaModule, ContentfulModule],
})
export class ContentModule {}
