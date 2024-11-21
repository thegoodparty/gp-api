import { documentToPlainTextString } from '@contentful/rich-text-plain-text-renderer'
import { transformContentMedia } from '../util/transformContentMedia.util'
import { transformBlogArticleRawTags } from '../util/transformBlogArticleRawTags.util'
import { transformBlogArticleAuthor } from '../util/transformBlogArticleAuthor.util'
import { transformBlogArticleSection } from '../util/transformBlogArticleSection.util'
import { transformBlogArticleBanner } from '../util/transformBlogArticleBanner.util'
import { transformBlogArticleRelatedArticles } from '../util/transformBlogArticleRelatedArticles.util'
import { transformBlogArticleReferences } from '../util/transformBlogArticleReferences.util'
import {
  BlogArticleAugmented,
  BlogArticleContentRaw,
  Transformer,
} from '../content.types'
import { Content } from '@prisma/client'
import { readingTime } from 'reading-time-estimator'

export const blogArticleTransformer: Transformer = (
  content: Content[],
): BlogArticleAugmented[] =>
  content.map((rawContent: BlogArticleContentRaw): BlogArticleAugmented => {
    const { data, id, updatedAt, type } = rawContent
    const {
      author: rawAuthor,
      section: rawSection,
      banner: rawBanner,
      relatedArticles: rawRelatedArticles,
      references: rawReferences,
      ...restRawData
    } = data
    const text = documentToPlainTextString(restRawData.body)
    const readingTimeResult = readingTime(text, 200)
    const readingTimeWithMs = {
      ...readingTimeResult,
      time: readingTimeResult.minutes * 60 * 1000,
    }
    return {
      ...restRawData,
      id,
      type,
      text,
      readingTime: readingTimeWithMs,
      updateDate: updatedAt,
      mainImage: transformContentMedia(restRawData.mainImage),
      tags: [...transformBlogArticleRawTags(restRawData.tags).values()],
      ...(rawSection
        ? {
            section: transformBlogArticleSection(rawSection),
          }
        : {}),
      ...(rawAuthor
        ? {
            author: rawAuthor && transformBlogArticleAuthor(rawAuthor),
          }
        : {}),
      ...(rawBanner
        ? {
            banner: transformBlogArticleBanner(rawBanner),
          }
        : {}),
      ...(rawRelatedArticles
        ? {
            relatedArticles:
              transformBlogArticleRelatedArticles(rawRelatedArticles),
          }
        : {}),
      ...(rawReferences
        ? {
            references: transformBlogArticleReferences(rawReferences),
          }
        : {}),
    }
  })
