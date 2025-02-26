import { BadRequestException, Controller, Get, Param } from '@nestjs/common'
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
  findAll() {
    return this.contentService.findAll()
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.contentService.findById(id)
  }

  @Get(`type/${CONTENT_TYPE_MAP.glossaryItem.name}`)
  getGlossaryItems() {
    return this.contentService.fetchGlossaryItems()
  }

  // TODO: This endpoint shouldn't be needed: https://goodparty.atlassian.net/browse/WEB-3374
  @Get(`type/${CONTENT_TYPE_MAP.glossaryItem.name}/by-letter`)
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
  async findBlogArticlesBySection(@Param('sectionSlug') sectionSlug: string) {
    return this.blogArticleMetaService.findBlogArticlesBySection(sectionSlug)
  }

  @Get('blog-articles-by-section')
  async listBlogArticlesBySection() {
    return await this.blogArticleMetaService.findBlogArticlesBySection()
  }

  @Get('blog-articles-by-tag/:tag')
  async findBlogArticlesByTag(@Param('tag') tag: string) {
    return this.blogArticleMetaService.findBlogArticlesByTag(tag)
  }

  @Get('blog-article/:slug')
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
  async articleTags() {
    return this.blogArticleMetaService.findAllBlogArticleTags()
  }

  @Get('article-tags/:tagSlug')
  async articleTag(@Param('tagSlug') tagSlug: string) {
    return this.blogArticleMetaService.findAllBlogArticleTags(tagSlug)
  }
}
