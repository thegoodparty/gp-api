import { Transformer, AIChatPrompt, AIChatPrompts } from '../content.types'

export const aiChatPromptsTransformer: Transformer<
  AIChatPrompt,
  AIChatPrompts
> = (prompts: AIChatPrompt[]): AIChatPrompts[] => [
  prompts.reduce((acc, prompt) => {
    const { name } = prompt.data
    return {
      ...acc,
      [name]: {
        ...prompt.data,
        id: prompt.id,
      },
    }
  }, {} as AIChatPrompts),
]
