import {
  Transformer,
  AIContentTemplateRaw,
  AIContentCategories,
} from '../content.types'
import { camelCase } from 'es-toolkit/string'

// AIContentCategories are grouped by the title found under each AIContentTemplateRaw's data.category.fields
// MPX: Several AIContentTemplateRaw's are used to make each 'AIContentCategories' object

export const aiContentCategoriesTransformer: Transformer<
  AIContentTemplateRaw,
  AIContentCategories
> = (aiContents: AIContentTemplateRaw[]): AIContentCategories[] => {
  const aiContentCategoriesHash: Record<
    string,
    Array<{
      key: string
      name: string
      taskOnly: boolean
      id: string
    }>
  > = {}
  const aiContentCategories: Array<{ title: string; order: number }> = []

  for (const aiContent of aiContents) {
    const { order, title } = aiContent.data.category.fields
    const { name, taskOnly } = aiContent.data
    const key = camelCase(name)

    if (!aiContentCategoriesHash[title]) {
      aiContentCategoriesHash[title] = []
      aiContentCategories.push({ title, order })
    }
    aiContentCategoriesHash[title].push({
      key,
      name,
      taskOnly,
      id: aiContent.id,
    })
  }

  return combineAiContentAndCategories(
    aiContentCategories,
    aiContentCategoriesHash,
  )
}

const combineAiContentAndCategories = (
  categories: Array<{ title: string; order: number }>,
  categoriesHash: Record<
    string,
    Array<{
      key: string
      name: string
      taskOnly: boolean
      id: string
    }>
  >,
) =>
  categories
    .sort((a, b) => a.order - b.order)
    .map(({ title, order }) => ({
      name: title,
      order,
      templates: categoriesHash[title],
    }))
