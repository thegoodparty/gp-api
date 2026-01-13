import {
  PromptInputFieldsAugmented,
  PromptInputFieldsRaw,
  Transformer,
} from '../content.types'

export const promptInputFieldsTransformer: Transformer<
  PromptInputFieldsRaw,
  PromptInputFieldsAugmented
> = (prompts: PromptInputFieldsRaw[]): PromptInputFieldsAugmented => {
  const promptInputFields = prompts.reduce((acc, prompt) => {
    const key = prompt.data.fieldId
    const entry = prompt.data.contentInput.map(({ fields }) => ({
      title: fields.title,
      helperText: fields.helperText,
    }))
    return {
      ...acc,
      [key]: entry,
    }
  }, {})

  return promptInputFields
}
