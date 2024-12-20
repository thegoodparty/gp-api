import { Logger } from '@nestjs/common'
import {
  Transformer,
  AIContentTemplateRaw,
  ContentPromptsQuestions,
} from '../content.types'
import { camelCase } from 'es-toolkit/string'

const logger = new Logger('ContentPromptsQuestionsTransformer')

export const contentPromptsQuestionsTransformer: Transformer<
  AIContentTemplateRaw,
  ContentPromptsQuestions
> = (templates: AIContentTemplateRaw[]): ContentPromptsQuestions[] => {
  const result = templates.reduce<ContentPromptsQuestions>((acc, template) => {
    if (template.data.name && template.data.requiresAdditionalQuestions) {
      return {
        ...acc,
        [camelCase(template.data.name)]:
          template.data.requiresAdditionalQuestions,
      }
    } else {
      logger.warn(
        'template.data.name and/or template.data.requiresAdditionalQuestions not found',
        template,
      )
    }
    return acc
  }, {})

  return [result]
}
