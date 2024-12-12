import {
  Transformer,
  AIContentTemplateRaw,
  CandidateContentPrompts
} from '../content.types';

export const candidateContentPromptsTransformer: Transformer<
  AIContentTemplateRaw,
  CandidateContentPrompts
> = (templates: AIContentTemplateRaw[]): CandidateContentPrompts[] => {
  const result = templates.reduce<CandidateContentPrompts>((acc, template) => {
    if (template.name && template.content) {
      console.log('template.name and template.content found, transforming');
      acc[template.name] = template.content;
    } else {
      console.log('template.name and/or template.content not found');
    }
    return acc;
  }, {});

  return [result];
};