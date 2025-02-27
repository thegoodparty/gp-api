import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
} from '@nestjs/common'
import { ContentService } from './content.service'
import { ContentType } from '@prisma/client'
import {
  CONTENT_TYPE_MAP,
  InferredContentTypes,
} from './CONTENT_TYPE_MAP.const'
import {
  groupGlossaryItemsByAlpha,
  mapGlossaryItemsToSlug,
} from './util/glossaryItems.util'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'
import { BlogArticleMetaService } from './services/blogArticleMeta.service'

@Controller('content')
@PublicAccess()
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly blogArticleMetaService: BlogArticleMetaService,
  ) {}

  @Get()
  @Header('cache-control', 'private, max-age=86400')
  findAll() {
    return this.contentService.findAll()
  }

  @Get(':id')
  @Header('cache-control', 'private, max-age=86400')
  findById(@Param('id') id: string) {
    return this.contentService.findById(id)
  }

  @Get(`type/${CONTENT_TYPE_MAP.glossaryItem.name}`)
  @Header('cache-control', 'private, max-age=86400')
  getGlossaryItems() {
    return this.contentService.fetchGlossaryItems()
  }

  // TODO: This endpoint shouldn't be needed: https://goodparty.atlassian.net/browse/WEB-3374
  @Get(`type/${CONTENT_TYPE_MAP.glossaryItem.name}/by-letter`)
  @Header('cache-control', 'private, max-age=86400')
  async getGlossaryItemsGroupedByAlpha() {
    return groupGlossaryItemsByAlpha(
      await this.contentService.fetchGlossaryItems(),
    )
  }

  // TODO: This endpoint shouldn't be needed: https://goodparty.atlassian.net/browse/WEB-3374
  @Get(`type/${CONTENT_TYPE_MAP.glossaryItem.name}/by-slug`)
  async getGlossaryItemsMappedBySlug() {
    return mapGlossaryItemsToSlug(
      await this.contentService.fetchGlossaryItems(),
    )
  }

  @Get('type/:type')
  @Header('cache-control', 'private, max-age=86400')
  findByType(@Param('type') type: ContentType | InferredContentTypes) {
    if (!CONTENT_TYPE_MAP[type]) {
      throw new BadRequestException(`${type} is not a valid content type`)
    }
    return this.contentService.findByType({ type })
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

  @Get('blog-articles-by-section/:sectionSlug')
  @Header('cache-control', 'private, max-age=86400')
  async findBlogArticlesBySection(@Param('sectionSlug') sectionSlug: string) {
    return this.blogArticleMetaService.findBlogArticlesBySection(sectionSlug)
  }

  @Get('blog-articles-by-section')
  @Header('cache-control', 'private, max-age=86400')
  async listBlogArticlesBySection() {
    return await this.blogArticleMetaService.findBlogArticlesBySection()
  }

  @Get('blog-articles-by-tag/:tag')
  @Header('cache-control', 'private, max-age=86400')
  async findBlogArticlesByTag(@Param('tag') tag: string) {
    return this.blogArticleMetaService.findBlogArticlesByTag(tag)
  }

  @Get('blog-article/:slug')
  @Header('cache-control', 'private, max-age=86400')
  async findBlogArticleBySlug(@Param('slug') slug: string) {
    return (
      await this.contentService.findByType({
        type: ContentType.blogArticle,
        where: {
          data: {
            path: ['slug'],
            equals: slug,
          },
        },
      })
    )[0]
  }

  @Get('article-tags')
  @Header('cache-control', 'private, max-age=86400')
  async articleTags() {
    return this.blogArticleMetaService.findBlogArticleTags()
  }

  @Get('article-tags/:tagSlug')
  @Header('cache-control', 'private, max-age=86400')
  async articleTag(@Param('tagSlug') tagSlug: string) {
    return this.blogArticleMetaService.findBlogArticleTag(tagSlug)
  }
}
