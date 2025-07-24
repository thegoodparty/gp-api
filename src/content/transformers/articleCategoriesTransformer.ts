import {
  FaqArticleContentRaw,
  ArticleCategories,
  Transformer,
  ArticleCategoryRaw,
  TYPE_ARTICLE_CATEGORY,
  TYPE_FAQ_ARTICLE,
} from '../content.types'

export const articleCategoriesTransformer: Transformer<
  FaqArticleContentRaw,
  ArticleCategories
> = (
  inputs: (FaqArticleContentRaw | ArticleCategoryRaw)[],
): ArticleCategories[] => {
  const articleCategories: ArticleCategories[] = []
  for (const input of inputs) {
    if (input.type === TYPE_FAQ_ARTICLE) {
      const categoryFields = input.data.category?.[0]?.fields ?? null
      const foundCategory = articleCategories.find(
        (category) => category.fields.name === categoryFields?.name,
      )

      if (categoryFields && !foundCategory) {
        articleCategories.push({
          fields: {
            name: categoryFields.name,
            order: categoryFields.order || 9999,
          },
          name: categoryFields.name,
          id: null,
          articles: [
            {
              title: input.data.title,
              id: input.id,
              order: input.data.order || 9999,
            },
          ],
          order: categoryFields.order || 9999,
        } as ArticleCategories)
      } else if (categoryFields && foundCategory) {
        foundCategory.articles.push({
          title: input.data.title,
          id: input.id,
          order: input.data.order || 9999,
        })
      }
    } else if (input.type === TYPE_ARTICLE_CATEGORY) {
      const categoryName = input.data.name
      const foundCategory = articleCategories.find(
        (category) => category.fields.name === categoryName,
      )

      if (!foundCategory && categoryName) {
        articleCategories.push({
          fields: {
            name: categoryName,
            order: input.data.order,
          },
          name: categoryName,
          id: input.id,
          articles: [],
          order: input.data.order,
        })
      } else if (foundCategory && categoryName && !foundCategory.id) {
        foundCategory.id = input.id
      }
    }
  }

  articleCategories.sort(compareArticleCategories)

  articleCategories.forEach((category) => {
    category.articles.sort((a, b) => (a.order || 9999) - (b.order || 9999))
  })

  return articleCategories
}

function compareArticleCategories(a, b) {
  const orderA = a.fields.order || 9999
  const orderB = b.fields.order || 9999
  if (orderA > orderB) {
    return 1
  }
  if (orderA < orderB) {
    return -1
  }
  return 0
}
