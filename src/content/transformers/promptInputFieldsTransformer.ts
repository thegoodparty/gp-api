import {
  Transformer,
  PromptInputFieldsAugmented,
  PromptInputFieldsRaw,
} from '../content.types'

export const promptInputFieldsTransformer: Transformer<
  PromptInputFieldsRaw,
  PromptInputFieldsAugmented
> = (prompts: PromptInputFieldsRaw[]): PromptInputFieldsAugmented[] => {
  const promptInputFields = prompts.reduce((acc, prompt) => {
    const key = prompt.data.fieldId
    const entry = prompt.data.contentInput.map(({ fields }) => ({
      title: fields.title,
      helperText: fields.helperText,
    }))
    acc[key] = entry
    return acc
  }, {})

  return [promptInputFields]
}
