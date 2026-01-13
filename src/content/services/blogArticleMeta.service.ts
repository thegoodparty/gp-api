import { Injectable, NotFoundException } from '@nestjs/common'
import { addDays } from 'date-fns'
import { createPrismaBase, MODELS } from '../../prisma/util/prisma.util'
import { DateFormats, formatDate } from '../../shared/util/date.util'
import { mapBlogArticlesToSections } from '../util/mapBlogArticlesToSections.util'

@Injectable()
export class BlogArticleMetaService extends createPrismaBase(
  MODELS.BlogArticleMeta,
) {
  constructor() {
    super()
  }

  async findBlogArticleTag(tagSlug?: string) {
    const { tags: articleTags } =
      (await this.model.findFirst({
        where: {
          tags: {
            array_contains: [{ slug: tagSlug }],
          },
        },
        select: {
          tags: true,
        },
      })) || {}
    if (!articleTags || !articleTags.length) {
      throw new NotFoundException(`Tag with slug ${tagSlug} not found`)
    }
    return articleTags.find(({ slug }) => slug === tagSlug)
  }

  async findBlogArticleTags() {
    const articleTags = await this.model.findMany({
      select: {
        tags: true,
      },
    })
    const dedupedArticleTags = articleTags.reduce((acc, curr) => {
      curr.tags.forEach((tag) => {
        acc.set(tag.slug, tag)
      })
      return acc
    }, new Map<string, PrismaJson.BlogArticleTag>())
    return [...dedupedArticleTags.values()].sort(
      ({ name: aName }, { name: bName }) =>
        aName < bName ? -1 : aName > bName ? 1 : 0,
    )
  }

  async findBlogArticlesByTag(tag: string) {
    return (
      await this.model.findMany({
        where: {
          tags: {
            array_contains: [{ slug: tag }],
          },
        },
      })
    )
      .sort(
        ({ publishDate: a }, { publishDate: b }) => b.getTime() - a.getTime(),
      )
      .map(({ title, mainImage, publishDate, slug, summary }) => ({
        title,
        mainImage,
        // TODO: stop sending these non-standard date strings around. We have to add one day to match the
        //  Date object in the DB, which is not a good practice and will most definitely cause confusion later on
        publishDate: formatDate(addDays(publishDate, 1), DateFormats.isoDate),
        slug,
        summary,
      }))
  }

  async listArticlesBySection(sectionSlug?: string, limit?: number) {
    const blogArticleMetas = await this.model.findMany({
      ...(sectionSlug
        ? {
            where: {
              section: {
                path: ['fields', 'slug'],
                equals: sectionSlug,
              },
            },
          }
        : {}),
      orderBy: {
        publishDate: 'desc',
      },
    })

    return mapBlogArticlesToSections(blogArticleMetas, limit)
  }

  async listArticleSections() {
    return (
      await this.model.findMany({
        distinct: ['section'],
        select: {
          section: true,
        },
      })
    ).map(({ section }) => section)
  }

  async getBlogArticleSectionBySlug(sectionSlug: string) {
    return (
      await this.model.findFirstOrThrow({
        select: {
          section: true,
        },
        where: {
          section: {
            path: ['fields', 'slug'],
            equals: sectionSlug,
          },
        },
      })
    ).section
  }
}
