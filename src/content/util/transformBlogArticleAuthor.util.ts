import { BlogArticleAuthorRaw } from '../content.types'
import { transformContentMedia } from './transformContentMedia.util'

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
