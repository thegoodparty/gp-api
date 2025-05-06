import {
  FaqArticleContentAugmented,
  FaqArticleContentRaw,
  Transformer,
} from '../content.types'

export const faqArticlesTransformer: Transformer<
  FaqArticleContentRaw,
  FaqArticleContentAugmented
> = (content: FaqArticleContentRaw[]) =>
  content.map((entry: FaqArticleContentRaw): FaqArticleContentAugmented => {
    const {
      id,
      createdAt,
      updatedAt,
      type,
      data: { category, ...dataExcludingCategory },
    } = entry
    const firstCategory = category?.[0]

    return {
      id,
      createdAt,
      updatedAt,
      type,
      ...dataExcludingCategory,
      ...(firstCategory
        ? {
            category: {
              id: firstCategory.sys.id,
              fields: firstCategory.fields,
            },
          }
        : {}),
    }
  })
