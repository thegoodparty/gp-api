import {
  BlogArticleContentRaw,
  BlogArticlesTagsMap,
  BlogArticleTag,
  Transformer,
} from '../content.types'
import { transformBlogArticleRawTags } from '../util/transformBlogArticleRawTags.util'

export const articleTagsTransformer: Transformer<
  BlogArticleContentRaw,
  BlogArticleTag
> = (articles: BlogArticleContentRaw[]): BlogArticleTag[] => [
  ...articles
    .reduce(
      (
        articleTags: BlogArticlesTagsMap,
        article: BlogArticleContentRaw,
      ): BlogArticlesTagsMap => {
        const { tags } = article.data
        return new Map([...articleTags, ...transformBlogArticleRawTags(tags)])
      },
      new Map() as BlogArticlesTagsMap,
    )
    .values(),
]
