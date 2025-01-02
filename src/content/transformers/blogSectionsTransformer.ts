import { ImportTemplate } from '@hubspot/api-client/lib/codegen/crm/imports';
import {
  BlogArticleContentRaw,
  BlogSectionRaw,
  BlogSections,
  Transformer
} from '../content.types'
import { articleCategoriesTransformer } from './articleCategoriesTransformer';
type Bogus = {
  [key: string]: string
}

export const blogSectionsTransformer: Transformer<
  BlogSectionRaw,
  Bogus
> = (sectionOrArticle: (BlogSectionRaw | BlogArticleContentRaw)[]): Bogus[] => {
  printNestedObjects(sectionOrArticle);
  const sectionsById = {};
  for (const item of sectionOrArticle) {
    if (item.type === 'blogSection') {
      sectionsById[item.id] = { ...item, article:[] };
    } else if (item.type === 'blogArticle') {
      //if (item.data.section && sectionsById[item.data.section])
    }
  }

  return [{
    hello: 'wow'
  }]

  // return [{
  //   fields: {
  //     title: 'string',
  //     subtitle: 'string;',
  //     slug: 'string;',
  //     order: 1,
  //   },
  //   id: 'string;',
  //   slug: 'string;',
  //   tags: [],
  //   articles: BlogArticleHighlight[]
  //   order: 1,
  // }]
}

function printNestedObjects(obj: Record<string, any>, path: string[] = []): void {
  // Iterate over each key in the object
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      const currentPath = [...path, key];

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // If the value is an object, print it and recurse
        console.log(`Path: ${currentPath.join('.')}, Object:`, value);
        printNestedObjects(value, currentPath);
      }
    }
  }
}
