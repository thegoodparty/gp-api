import { Controller, Get, Param, Query } from '@nestjs/common'
import { ContentService } from './content.service'
import { ContentType } from '@prisma/client'

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

  @Get('type/:type')
  findByType(@Param('type') type: ContentType) {
    return this.contentService.findByType(type)
  }

  @Get('sync')
  async sync(@Query('seed') seed: boolean = false) {
    const { entries, createEntries, updateEntries, deletedEntries } =
      await this.contentService.syncContent(seed)

    return {
      entriesCount: entries.length,
      createEntriesCount: createEntries.length,
      updateEntriesCount: updateEntries.length,
      deletedEntriesCount: deletedEntries.length,
    }
  }
}
