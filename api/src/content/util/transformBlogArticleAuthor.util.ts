import { transformContentMedia } from './transformContentMedia.util'
import { BlogArticleAuthor, BlogArticleAuthorRaw } from '../content.types'

export const transformBlogArticleAuthor = (
  rawAuthor: BlogArticleAuthorRaw,
): BlogArticleAuthor => {
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
