import { camelCase } from 'es-toolkit/string'
import {
  AIContentTemplateRaw,
  ContentPromptsQuestions,
  Transformer,
} from '../content.types'

export const contentPromptsQuestionsTransformer: Transformer<
  AIContentTemplateRaw,
  ContentPromptsQuestions
> = (templates: AIContentTemplateRaw[]): ContentPromptsQuestions => {
  const result = templates.reduce<ContentPromptsQuestions>((acc, template) => {
    if (template.data.name && template.data.requiresAdditionalQuestions) {
      return {
        ...acc,
        [camelCase(template.data.name)]:
          template.data.requiresAdditionalQuestions,
      }
    }
    return acc
  }, {})

  return result
}
