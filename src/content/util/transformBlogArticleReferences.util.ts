import { BlogArticleReferenceRaw } from '../content.types'

export const transformBlogArticleReferences = (
  rawBlogArticleReferences: BlogArticleReferenceRaw[],
) =>
  rawBlogArticleReferences.map(({ fields }) => {
    const { url, name, description } = fields as {
      url: string
      name: string
      description: string
    }
    return {
      url,
      name,
      description,
    }
  })
