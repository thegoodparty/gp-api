import { Controller, Get, Param, Query } from '@nestjs/common'
import { ContentService } from './content.service'

@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  findAll() {
    return this.contentService.findAll()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contentService.findOne(+id)
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
