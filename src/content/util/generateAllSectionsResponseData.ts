import { BlogArticlesSectionAugmented, BlogSectionHero } from '../content.types'
import { BlogArticleMeta } from '@prisma/client'

export const generateAllSectionsResponseData = (
  sections: BlogArticlesSectionAugmented[],
  blogArticleMetas: BlogArticleMeta[],
) => {
  let hero: BlogSectionHero = blogArticleMetas[0]

  const result: BlogArticlesSectionAugmented[] = []
  let sectionIndex = 0
  for (let i = 0; i < sections.length; i++) {
    sectionIndex = i
    const section = sections[i]
    if (!section.articles || section.articles.length < 5) continue
    if (section.articles[0].contentId === hero.contentId) {
      section.articles = section.articles.slice(1, 4)
      hero.section = section
    } else {
      section.articles = section.articles.slice(0, 3)
    }
    result.push(section)
  }
  result.sort((a, b) => a.fields.order - b.fields.order)
  return {
    sections: result,
    hero,
    sectionIndex,
  }
}
