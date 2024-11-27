import { BlogArticleReferenceRaw } from '../content.types'

export const transformBlogArticleReferences = (
  rawBlogArticleReferences: BlogArticleReferenceRaw[],
) =>
  rawBlogArticleReferences.map(({ fields }) => {
    const { url, name, description } = fields
    return {
      url,
      name,
      description,
    }
  })
