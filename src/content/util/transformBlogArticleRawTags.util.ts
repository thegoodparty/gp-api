import slugify from 'slugify'
import { BlogArticlesTagsMap, BlogArticleTagRaw } from '../content.types'

export const transformBlogArticleRawTags = (
  tags: BlogArticleTagRaw[] = [],
): BlogArticlesTagsMap =>
  tags.reduce((acc: BlogArticlesTagsMap, tag) => {
    const slug = slugify(tag.fields.name, { lower: true })
    return acc.set(slug, {
      name: tag.fields.name,
      slug,
    })
  }, new Map() as BlogArticlesTagsMap)
