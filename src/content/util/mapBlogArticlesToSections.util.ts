import { BlogArticleMeta } from '@prisma/client'

export const mapBlogArticlesToSections = (
  articles: BlogArticleMeta[],
  limit?: number,
) => {
  return Object.fromEntries(
    articles.reduce((acc, curr) => {
      const section = curr.section as { fields: { slug: string } }
      const currentSectionSlug = section.fields.slug
      const existingSection = acc.get(currentSectionSlug) || []
      const sectionArticles = [...existingSection, curr].slice(0, limit)

      return acc.set(currentSectionSlug, sectionArticles)
    }, new Map<string, BlogArticleMeta[]>()),
  )
}
