import slugify from 'slugify'
import { BlogArticleTag, BlogArticleTagRaw } from '../content.types'

export const transformBlogArticleTags = (tags: BlogArticleTagRaw[] = []) =>
  tags
    .reduce((acc: Map<string, BlogArticleTag>, tag) => {
      const slug = slugify(tag.fields.name, { lower: true })
      return acc.set(slug, {
        name: tag.fields.name,
        slug,
      })
    }, new Map())
    .values()
    .toArray()
