import { BlogArticleMeta } from '@prisma/client'

export const mapBlogArticlesToSections = (
  articles: BlogArticleMeta[],
  limit?: number,
) => {
  return Object.fromEntries(
    articles.reduce((acc, curr) => {
      const currentSectionSlug = curr.section.fields.slug
      return acc.set(currentSectionSlug, [
        ...(acc.has(currentSectionSlug)
          ? [...(acc.get(currentSectionSlug) || []), curr].slice(0, limit)
          : [curr]),
      ])
    }, new Map<string, BlogArticleMeta[]>()),
  )
}
