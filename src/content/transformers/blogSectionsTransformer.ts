import {
  BlogArticleContentRaw,
  BlogSectionRaw,
  Transformer,
  BlogSections,
  TYPE_BLOG_ARTICLE,
  TYPE_BLOG_SECTION,
} from '../content.types'
import { transformContentMedia } from '../util/transformContentMedia.util'

export const blogSectionsTransformer: Transformer<
  BlogSectionRaw | BlogArticleContentRaw,
  BlogSections
> = (
  sectionOrArticle: (BlogSectionRaw | BlogArticleContentRaw)[],
): BlogSections[] => {
  const sectionsById = {}
  for (const item of sectionOrArticle) {
    if (item.type === TYPE_BLOG_SECTION) {
      sectionsById[item.id] = {
        fields: item.data,
        id: item.id,
        articles: [],
      }
    } else if (item.type === TYPE_BLOG_ARTICLE) {
      const sectionId = item.data.section?.sys?.id
      if (sectionId) {
        // Lazy initalization for optimization
        if (!sectionsById[sectionId]) {
          sectionsById[sectionId] = {
            fields: {},
            id: sectionId,
            articles: [],
          }
        }
        sectionsById[sectionId].articles.push({
          title: item.data.title,
          id: item.id,
          mainImage: transformContentMedia(item.data?.mainImage),
          publishDate: item.data?.publishDate,
          slug: item.data?.slug,
          summary: item.data?.summary,
        })
      }
    }
  }

  return Object.values(sectionsById)
}
