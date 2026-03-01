import {
  Transformer,
  AIContentTemplateRaw,
  CandidateContentPrompts,
} from '../content.types'
import { camelCase } from 'es-toolkit/string'

export const candidateContentPromptsTransformer: Transformer<
  AIContentTemplateRaw,
  CandidateContentPrompts
> = (templates, logger) => {
  const result = templates.reduce<CandidateContentPrompts>((acc, template) => {
    if (template.data.name && template.data.content) {
      return {
        ...acc,
        [camelCase(template.data.name)]: template.data.content,
      }
    } else {
      logger.warn(
        template,
        'template.data.name and/or template.data.content not found',
      )
    }
    return acc
  }, {})

  return result
}
