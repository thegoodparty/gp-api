import { Logger } from '@nestjs/common';
import {
  Transformer,
  AIContentTemplateRaw,
  ContentPromptsQuestions
} from '../content.types';
import { camelCase } from 'lodash';

const logger = new Logger('ContentPromptsQuestionsTransformer');

export const contentPromptsQuestionsTransformer: Transformer<
  AIContentTemplateRaw,
  ContentPromptsQuestions
> = (templates: AIContentTemplateRaw[]): ContentPromptsQuestions[] => {
  const result = templates.reduce<ContentPromptsQuestions>((acc, template) => {
    if (template.data.name && template.data.requiresAdditionalQuestions) {
      const name = camelCase(template.data.name);
      acc[name] = template.data.requiresAdditionalQuestions;
    } else {
      logger.warn('template.data.name and/or template.data.requiresAdditionalQuestions not found', template);
    }
    return acc;
  }, {});

  return [result];
};