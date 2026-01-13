import { documentToPlainTextString } from '@contentful/rich-text-plain-text-renderer'
import {
  BlogArticleAugmented,
  BlogArticleContentRaw,
  Transformer,
} from '../content.types'
import { transformBlogArticleAuthor } from '../util/transformBlogArticleAuthor.util'
import { transformBlogArticleBanner } from '../util/transformBlogArticleBanner.util'
import { transformBlogArticleRawTags } from '../util/transformBlogArticleRawTags.util'
import { transformBlogArticleReferences } from '../util/transformBlogArticleReferences.util'
import { transformBlogArticleRelatedArticles } from '../util/transformBlogArticleRelatedArticles.util'
import { transformBlogArticleSection } from '../util/transformBlogArticleSection.util'
import { transformContentMedia } from '../util/transformContentMedia.util'

export const blogArticlesTransformer: Transformer<
  BlogArticleContentRaw,
  BlogArticleAugmented
> = (content: BlogArticleContentRaw[]): BlogArticleAugmented[] =>
  content.map((rawContent: BlogArticleContentRaw): BlogArticleAugmented => {
    const { data, id, type } = rawContent
    const {
      author: rawAuthor,
      section: rawSection,
      banner: rawBanner,
      relatedArticles: rawRelatedArticles,
      references: rawReferences,
      mainImage: rawMainImage,
      tags: rawTags,
      ...restRawData
    } = data
    const text = documentToPlainTextString(restRawData.body)

    return {
      ...restRawData,
      id,
      type,
      text,
      mainImage: transformContentMedia(rawMainImage),
      tags: [...transformBlogArticleRawTags(rawTags).values()],
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
      // TODO: Build relatedArticles from BlogArticleMeta relations
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
