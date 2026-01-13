import { BlogArticleRelatedArticleRaw } from '../content.types'
import { transformContentMedia } from './transformContentMedia.util'

export const transformBlogArticleRelatedArticles = (
  relatedArticles: BlogArticleRelatedArticleRaw[] = [],
) =>
  relatedArticles.map((relatedArticle) => ({
    ...relatedArticle.fields,
    mainImage: transformContentMedia(relatedArticle.fields?.mainImage),
  }))
