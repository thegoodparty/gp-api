import readingTime from 'reading-time'
import { documentToPlainTextString } from '@contentful/rich-text-plain-text-renderer'
import { transformContentMedia } from '../util/transformContentMedia.util'
import { transformBlogArticleTags } from '../util/tranformBlogArticleTags.util'
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

export const blogArticleTransformer: Transformer = (
  rawContent: BlogArticleContentRaw,
): BlogArticleAugmented => {
  const {
    author: rawAuthor,
    section: rawSection,
    banner: rawBanner,
    relatedArticles: rawRelatedArticles,
    references: rawReferences,
    ...restRawData
  } = rawContent.data
  const text = documentToPlainTextString(restRawData.body)
  return {
    ...restRawData,
    id: rawContent.id,
    text,
    readingTime: readingTime(text),
    updateDate: rawContent.updatedAt,
    mainImage: transformContentMedia(restRawData.mainImage),
    tags: transformBlogArticleTags(restRawData.tags),
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
}
