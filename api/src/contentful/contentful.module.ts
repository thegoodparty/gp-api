import { Module } from '@nestjs/common'
import { ContentfulService } from './contentful.service'

@Module({
  providers: [ContentfulService],
  exports: [ContentfulService],
})
export class ContentfulModule {}
