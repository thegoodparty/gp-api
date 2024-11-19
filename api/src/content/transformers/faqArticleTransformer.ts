import { ContentRaw, Transformer } from '../content.module'
import { Content } from '@prisma/client'

export type FaqArticleCategoryRaw = {
  sys: {
    id: string
  }
  fields: {
    name: string
    order?: number
  }
}

type FaqArticleContentRawData = {
  data: {
    category?: FaqArticleCategoryRaw[]
  }
}

export type FaqArticleContentRaw = ContentRaw<FaqArticleContentRawData>

export type FaqArticleContentAugmented = Partial<Content> & {
  category?: {
    id: string
    fields: {
      name: string
      order?: number
    }
  }
}

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
