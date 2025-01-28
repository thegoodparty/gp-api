import slugify from 'slugify'
import {
  ArticleSlugsByTag,
  BlogArticleContentRaw,
  Transformer,
} from '../content.types'

export const articleTagsTransformer: Transformer<
  BlogArticleContentRaw,
  ArticleSlugsByTag
> = (articles: BlogArticleContentRaw[]): ArticleSlugsByTag[] => {
  const articleTags: ArticleSlugsByTag = {}
  for (const article of articles) {
    const articleSlug = article.data.slug
    const tags = article.data.tags

    for (const tag of tags) {
      const tagSlug = slugify(tag.fields.name.toLowerCase())

      articleTags[tagSlug] = articleTags[tagSlug] || {
        tagName: tag.fields.name,
        articleSlugs: [],
      }
      articleTags[tagSlug].articleSlugs.push(articleSlug)
    }
  }
  return [articleTags]
}
