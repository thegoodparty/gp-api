import {
  FaqArticleContentAugmented,
  FaqArticleContentRaw,
  Transformer,
} from '../content.types'

export const faqArticleTransformer: Transformer = (
  content: FaqArticleContentRaw,
): FaqArticleContentAugmented => {
  const {
    id,
    createdAt,
    updatedAt,
    type,
    data: { category, ...dataExcludingCategory },
  } = content
  const firstCategory = category?.[0]

  return {
    id,
    createdAt,
    updatedAt,
    type,
    ...dataExcludingCategory,
    ...(firstCategory
      ? {
          id: firstCategory.sys.id,
          fields: firstCategory.fields,
        }
      : {}),
  }
}
