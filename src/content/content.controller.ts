import {
  BadRequestException,
  Controller,
  Get,
  InternalServerErrorException,
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
import {
  ArticleSlugsByTag,
  BlogArticleAugmented,
  BlogArticlePreview1,
  BlogArticlePreview2,
  BlogSection,
  Hero,
} from './content.types'

@Controller('content')
@PublicAccess()
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
    const sections: BlogSection[] = await this.contentService.findByType({
      type: InferredContentTypes.blogSections,
    })
    if (!sections) {
      throw new InternalServerErrorException("Blog sections couldn't be pulled")
    }
    const results: BlogSection[] = []
    let sectionIndex = 0
    let hero
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]
      if (section.fields.slug === sectionSlug) {
        sectionIndex = i

        if (!section.articles) continue
        section.articles.sort(
          (a, b) =>
            new Date(b.publishDate).getTime() -
            new Date(a.publishDate).getTime(),
        )
        const { id, title, mainImage, publishDate, slug, summary } =
          section.articles[0] // Based on previous sorting, this should be the newest article
        hero = { id, title, mainImage, publishDate, slug, summary }
        section.articles = section.articles.slice(1)
        results.push(section)
      } else {
        delete section.articles
        results.push(section)
      }
    }
    return { sections: results, hero: hero, sectionIndex }
  }

  @Get('blog-articles-by-section')
  async listBlogArticlesBySection() {
    const sections: BlogSection[] = await this.contentService.findByType({
      type: InferredContentTypes.blogSections,
    })
    const heroObj: BlogArticleAugmented[] =
      await this.contentService.findByType({
        type: ContentType.blogArticle,
        orderBy: { id: 'desc' },
        take: 1,
      })
    if (!sections || !heroObj) {
      throw new InternalServerErrorException(
        'blogSection or blogArticle could not be found',
      )
    }
    const { id, title, mainImage, publishDate, slug, summary } = heroObj[0]
    const hero: Hero = { id, title, mainImage, publishDate, slug, summary }

    const result: BlogSection[] = []
    let sectionIndex = 0
    for (let i = 0; i < sections.length; i++) {
      sectionIndex = i
      const section = sections[i]
      if (!section.articles || section.articles.length < 5) continue
      section.slug = section.fields.slug
      if (section.articles[0].id === hero.id) {
        section.articles = section.articles.slice(1, 4)
        hero.section = { fields: { title: section.fields.title } }
      } else {
        section.articles = section.articles.slice(0, 3)
      }
      result.push(section)
    }
    result.sort((a, b) => a.fields.order - b.fields.order)
    return { sections: result, hero, sectionIndex }
  }

  @Get('blog-articles-by-tag/:tag')
  async findBlogArticlesByTag(@Param('tag') tag: string) {
    const articleSlugsByTag: ArticleSlugsByTag[] =
      await this.contentService.findByType({
        type: InferredContentTypes.articleTag,
      })
    const selectedArticleSlugsByTag = articleSlugsByTag[0][tag]

    if (!selectedArticleSlugsByTag) {
      throw new BadRequestException('Content fetch failed.')
    }

    const blogArticles: BlogArticleAugmented[] =
      await this.contentService.findByType({ type: ContentType.blogArticle })
    const filteredBlogArticles = blogArticles.filter((article) => {
      return selectedArticleSlugsByTag.articleSlugs.includes(article.slug)
    })

    const articlePreviews: BlogArticlePreview1[] = []

    for (const article of filteredBlogArticles) {
      const { title, mainImage, publishDate, slug, summary } = article
      articlePreviews.push({
        title,
        mainImage,
        publishDate,
        slug,
        summary,
      })
    }

    articlePreviews.sort(
      (a, b) =>
        new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime(),
    )

    return {
      articles: articlePreviews,
      tagName: selectedArticleSlugsByTag.tagName,
    }
  }

  @Get('blog-article/:slug')
  async findBlogArticleBySlug(@Param('slug') slug: string) {
    const blogArticles = await this.contentService.findByType({
      type: ContentType.blogArticle,
      where: {
        data: {
          path: ['slug'],
          equals: slug,
        },
      },
    })

    return blogArticles[0]
  }

  @Get('blog-articles-by-slug/:slug')
  async findBlogArticlesBySlug(@Param('slug') slug: string) {
    const blogArticles: BlogArticleAugmented[] =
      await this.contentService.findByType({
        type: ContentType.blogArticle,
        where: {
          data: {
            path: ['slug'],
            equals: slug,
          },
        },
      })

    const articles: BlogArticlePreview2 = {}

    for (const article of blogArticles) {
      articles[article.slug] = {
        title: article.title,
        slug: article.slug,
        summary: article.summary,
      }
    }

    return articles
  }

  @Get('article-tags')
  async articleTags(): Promise<PrismaJson.BlogArticleTag[]> {
    const articleSlugsByTag: ArticleSlugsByTag = (
      await this.findByType(InferredContentTypes.articleTag)
    )[0]

    return Object.entries(articleSlugsByTag)
      .map(([tagSlug, tagObj]) => ({
        slug: tagSlug,
        name: tagObj.tagName,
      }))
      .sort((a, b) => {
        if (a.name < b.name) {
          return -1
        }
        if (a.name > b.name) {
          return 1
        }
        return 0
      })
  }
}
