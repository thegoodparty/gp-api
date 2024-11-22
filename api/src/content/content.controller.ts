import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common'
import { ContentService } from './content.service'
import { ContentType } from '@prisma/client'
import {
  CONTENT_TYPE_MAP,
  InferredContentTypes,
} from './CONTENT_TYPE_MAP.const'

@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  findAll() {
    return this.contentService.findAll()
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.contentService.findById(id)
  }

  @Get(`type/${CONTENT_TYPE_MAP.glossaryItem.name}`)
  findGlossaryItems() {
    return this.contentService.fetchGlossaryItems()
  }

  @Get('type/:type')
  findByType(@Param('type') type: ContentType | InferredContentTypes) {
    if (!CONTENT_TYPE_MAP[type]) {
      throw new BadRequestException(`${type} is not a valid content type`)
    }
    return this.contentService.findByType(type)
  }

  @Get('sync')
  async sync() {
    const { entries, createEntries, updateEntries, deletedEntries } =
      await this.contentService.syncContent()

    return {
      entriesCount: entries.length,
      createEntriesCount: createEntries.length,
      updateEntriesCount: updateEntries.length,
      deletedEntriesCount: deletedEntries.length,
    }
  }
}
