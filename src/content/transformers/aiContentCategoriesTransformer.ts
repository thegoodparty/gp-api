import { Logger } from '@nestjs/common';
import {
  Transformer,
  AIContentTemplateRaw,
  aiContentCategories
} from '../content.types';
import { camelCase } from 'lodash';

const logger = new Logger('aiContentCategoriesTransformer');

export const aiContentCategoriesTransformer: Transformer<
  AIContentTemplateRaw,
  aiContentCategories
> = (templates: AIContentTemplateRaw[]): aiContentCategories[] => {
  const result = templates.reduce<aiContentCategories>((acc, template) => {
    if (template.data.name && template.data.content) {
      const name = camelCase(template.data.name);
      acc[name] = template.data.content;
    } else {
      logger.warn('template.data.name and/or template.data.content not found', template);
    }
    return acc;
  }, {});

  return [result];
};