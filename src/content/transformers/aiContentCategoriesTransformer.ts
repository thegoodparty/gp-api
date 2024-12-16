import {
  Transformer,
  AIContentTemplateRaw,
  AIContentCategories
} from '../content.types';
import { camelCase } from 'lodash';

// AIContentCategories are grouped by the title found under each AIContentTemplateRaw's data.category.fields
// MPX: Several AIContentTemplateRaw's are used to make each 'AIContentCategories' object

export const aiContentCategoriesTransformer: Transformer<
  AIContentTemplateRaw,
  AIContentCategories
> = (aiContents: AIContentTemplateRaw[]): AIContentCategories[] => {
  const aiContentCategoriesHash = {};
  const aiContentCategories: any = [];

  for (const aiContent of aiContents) {
    const { order, title } = aiContent.data.category.fields;
    const { name } = aiContent.data;
    const key = camelCase(name)
    
    if (!aiContentCategoriesHash[title]) {
      aiContentCategoriesHash[title] = [];
      aiContentCategories.push({ title, order });
    }
    aiContentCategoriesHash[title].push({ key, name})
  }

  return combineAiContentAndCategories(aiContentCategories, aiContentCategoriesHash);
}


function combineAiContentAndCategories(categories, categoriesHash) {
  categories.sort((a, b) => a.order - b.order);
  const combined: any = [];
  categories.forEach((category) => {
    combined.push({
      name: category.title,
      templates: categoriesHash[category.title],
    });
  });
  return combined;
}
