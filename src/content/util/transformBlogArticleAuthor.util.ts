import { transformContentMedia } from './transformContentMedia.util'
import { BlogArticleAuthorRaw } from '../content.types'

export const transformBlogArticleAuthor = (
  rawAuthor: BlogArticleAuthorRaw,
): PrismaJson.BlogArticleAuthor => {
  const { image: rawImg, ...restFields } = rawAuthor.fields
  return {
    fields: {
      ...restFields,
      ...(rawImg && rawImg.fields
        ? {
            image: transformContentMedia(rawImg),
          }
        : {}),
    },
  }
}
