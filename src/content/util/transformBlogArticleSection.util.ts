import { BlogArticleSectionRaw } from '../content.types'

export const transformBlogArticleSection = (
  rawSection: BlogArticleSectionRaw,
): PrismaJson.BlogArticleSection => ({
  id: rawSection.sys.id,
  fields: rawSection.fields,
})
