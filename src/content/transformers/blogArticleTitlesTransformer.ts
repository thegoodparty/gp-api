import {
  Transformer,
  BlogArticleContentRaw,
  BlogArticleTitle,
} from '../content.types'

export const blogArticleTitlesTransformer: Transformer<
  BlogArticleContentRaw,
  BlogArticleTitle
> = (content: BlogArticleContentRaw[]): BlogArticleTitle[] =>
  content.map(({ data: { title, slug } }) => ({ title, slug }))
