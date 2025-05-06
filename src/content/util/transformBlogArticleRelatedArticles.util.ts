import { transformContentMedia } from './transformContentMedia.util'
import { BlogArticleRelatedArticleRaw } from '../content.types'

export const transformBlogArticleRelatedArticles = (
  relatedArticles: BlogArticleRelatedArticleRaw[] = [],
) =>
  relatedArticles.map((relatedArticle) => ({
    ...relatedArticle.fields,
    mainImage: transformContentMedia(relatedArticle.fields?.mainImage),
  }))
