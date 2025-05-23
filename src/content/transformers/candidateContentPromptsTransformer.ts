import { Logger } from '@nestjs/common'
import {
  Transformer,
  AIContentTemplateRaw,
  CandidateContentPrompts,
} from '../content.types'
import { camelCase } from 'es-toolkit/string'

const logger = new Logger('CandidateContentPromptsTransformer')

export const candidateContentPromptsTransformer: Transformer<
  AIContentTemplateRaw,
  CandidateContentPrompts
> = (templates: AIContentTemplateRaw[]): CandidateContentPrompts => {
  const result = templates.reduce<CandidateContentPrompts>((acc, template) => {
    if (template.data.name && template.data.content) {
      return {
        ...acc,
        [camelCase(template.data.name)]: template.data.content,
      }
    } else {
      logger.warn(
        'template.data.name and/or template.data.content not found',
        template,
      )
    }
    return acc
  }, {})

  return result
}
