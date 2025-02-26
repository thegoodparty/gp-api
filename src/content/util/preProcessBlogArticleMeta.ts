import {
  BlogArticleContentRaw,
  BlogArticlePreprocessed,
} from '../content.types'
import { transformBlogArticleAuthor } from './transformBlogArticleAuthor.util'
import { transformBlogArticleRawTags } from './transformBlogArticleRawTags.util'
import { transformContentMedia } from './transformContentMedia.util'
import { transformBlogArticleSection } from './transformBlogArticleSection.util'
import { transformBlogArticleReferences } from './transformBlogArticleReferences.util'

export const preProcessBlogArticleMeta = (
  rawBlogArticle: BlogArticleContentRaw,
): BlogArticlePreprocessed => {
  const { data, id: rawBlogArticleId } = rawBlogArticle
  const {
    title,
    slug,
    author: rawAuthor,
    section: rawSection,
    references: rawReferences,
    mainImage: rawMainImage,
    tags: rawTags,
    summary,
    relatedArticles: rawRelatedArticles,
    publishDate: rawPublishDate,
  } = data

  return {
    contentId: rawBlogArticleId,
    publishDate: new Date(rawPublishDate),
    author: transformBlogArticleAuthor(rawAuthor),
    title,
    slug,
    summary,
    tags: [...transformBlogArticleRawTags(rawTags).values()],
    mainImage: transformContentMedia(rawMainImage),
    section: transformBlogArticleSection(rawSection),
    references: rawReferences?.length
      ? transformBlogArticleReferences(rawReferences)
      : [],
    ...(rawRelatedArticles
      ? {
          relatedArticleIds: rawRelatedArticles.map(({ sys }) => sys.id),
        }
      : { relatedArticleIds: [] }),
  }
}
