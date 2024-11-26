import { BlogArticleSectionRaw } from '../content.types'

export const transformBlogArticleSection = (
  rawSection: BlogArticleSectionRaw,
) => ({
  id: rawSection.sys.id,
  fields: rawSection.fields,
})
