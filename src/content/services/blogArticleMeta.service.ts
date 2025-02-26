import { Injectable, NotFoundException } from '@nestjs/common'
import { createPrismaBase, MODELS } from '../../prisma/util/prisma.util'
import { DateFormats, formatDate } from '../../shared/util/date.util'
import { addDays } from 'date-fns'
import { BlogArticleMeta } from '@prisma/client'
import {
  BlogArticlesSectionAugmented,
  SpecificSectionResponseDatum,
} from '../content.types'
import { generateAllSectionsResponseData } from '../util/generateAllSectionsResponseData'

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
      curr.tags.forEach((tag) => acc.set(tag.slug, tag))
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

  async findBlogArticlesBySection(sectionSlug?: string) {
    const blogArticleMetas = await this.model.findMany({
      orderBy: {
        contentId: 'desc',
      },
    })

    const bySectionMap = blogArticleMetas.reduce((acc, curr) => {
      return acc.set(curr.section.id, {
        ...curr.section,
        slug: curr.section.fields.slug,
        articles: (acc.has(curr.section.id)
          ? [...(acc.get(curr.section.id)?.articles as BlogArticleMeta[]), curr]
          : [curr]
        ).sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime()),
      })
    }, new Map<string, BlogArticlesSectionAugmented>())

    const augmentedSections = [...bySectionMap.values()]

    return sectionSlug
      ? generateSpecificSectionResponseData(augmentedSections, sectionSlug)
      : generateAllSectionsResponseData(augmentedSections, blogArticleMetas)
  }
}

const generateSpecificSectionResponseData = (
  sections: BlogArticlesSectionAugmented[],
  sectionSlug: string,
) => {
  console.log(`sectionSlug =>`, sectionSlug)
  console.log(`sections =>`, sections)
  const results: SpecificSectionResponseDatum[] = []
  let sectionIndex = 0
  const heroSection = sections.find((section) => section.slug === sectionSlug)
  const hero = heroSection?.articles?.[0]
  console.log(`hero =>`, hero)
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    if (section.fields.slug === sectionSlug) {
      sectionIndex = i
      if (!section.articles) continue
      section.articles = section.articles.slice(1)
      results.push(section)
    } else {
      const { articles: _articles, ...sectionSansArticles } = section
      results.push(sectionSansArticles)
    }
  }
  return { sections: results, hero: hero, sectionIndex }
}
