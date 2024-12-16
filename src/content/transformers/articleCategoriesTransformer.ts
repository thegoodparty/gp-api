import { 
  FaqArticleContentRaw,
  ArticleCategories,
  Transformer,
  ArticleCategoryRaw,
} from '../content.types'

//mappedResponse.articleCategories.sort(compareArticleCategories);

export const articleCategoriesTransformer: Transformer<
FaqArticleContentRaw,
  ArticleCategories
> = (inputs: (FaqArticleContentRaw | ArticleCategoryRaw)[]): ArticleCategories[] => {
  const articleCategories = {};
  for (const input of inputs) {
    if (input.type === 'articleCategory') {
      input.data.name
    }
  }

  return [
    {
      fields: {
        name: 'string',
        order: 1,
    },
    id: 'string',
    name: 'string',
    articles: [
      {
        title: 'string',
        id: 'string',
      }
    ],
    order: 1
}]
}

function compareArticleCategories(a, b) {
  const orderA = a.fields.order || 9999;
  const orderB = b.fields.order || 9999;
  if (orderA > orderB) {
    return 1;
  }
  if (orderA < orderB) {
    return -1;
  }
  return 0;
}

function addArticlesToCategories(mapped) {
  const { articleCategories, faqArticles } = mapped;

  const categoriesById = {};
  articleCategories.forEach((category) => {
    categoriesById[category.id] = {
      ...category,
      name: category.fields.name,
      articles: [],
    };
  });
  faqArticles.forEach((article) => {
    if (article.category && categoriesById[article.category.id]) {
      categoriesById[article.category.id].articles.push({
        title: article.title,
        id: article.id,
      });
    }
  });
  mapped.articleCategories = Object.values(categoriesById);
}

// Input:  {
//   createdAt: 2024-12-12T20:50:16.964Z,
//   updatedAt: 2024-12-16T15:41:21.854Z,
//   id: '4CrRDuyTqip7XK7DdK4tq7',
//   type: 'articleCategory',
//   data: { name: 'How GoodParty.org Works', order: 1 }
// }
// Input:  {
//   createdAt: 2024-12-12T20:50:17.570Z,
//   updatedAt: 2024-12-16T15:41:22.327Z,
//   id: '579kihjyIPloNaEw02rniq',
//   type: 'faqArticle',
//   data: {
//     title: 'Meet the Team',
//     category: [ [Object] ],
//     articleBody: { data: {}, content: [Array], nodeType: 'document' }
//   }
// }

