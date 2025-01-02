import {
  BlogArticleContentRaw,
  BlogSectionRaw,
  Transformer,
  BlogSections,
} from '../content.types'
import { transformContentMedia } from '../util/transformContentMedia.util'

export const blogSectionsTransformer: Transformer<
  BlogSectionRaw,
  BlogSections
> = (
  sectionOrArticle: (BlogSectionRaw | BlogArticleContentRaw)[],
): BlogSections[] => {
  // Sort so that all blogSections can be handled first
  sectionOrArticle.sort((a, b) => {
    if (a.type < b.type) return 1
    if (a.type > b.type) return -1
    return 0
  })

  const sectionsById = {}
  for (const item of sectionOrArticle) {
    if (item.type === 'blogSection') {
      sectionsById[item.id] = {
        fields: item.data,
        id: item.id,
        articles: [],
      }
    } else if (item.type === 'blogArticle') {
      console.log(item)
      if (item.data.section && sectionsById[item.data.section.sys.id]) {
        sectionsById[item.data.section.sys.id].articles.push({
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
