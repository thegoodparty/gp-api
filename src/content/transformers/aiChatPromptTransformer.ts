import { Transformer, AIChatPrompt, AIChatPrompts } from '../content.types'

export const aiChatPromptsTransformer: Transformer<
  AIChatPrompt,
  AIChatPrompts
> = (prompts: AIChatPrompt[]): AIChatPrompts[] => [
  prompts.reduce((acc, prompt) => {
    const { name } = prompt.data
    acc[name] = {
      ...prompt.data,
      id: prompt.id,
    }
    return acc
  }, {} as AIChatPrompts),
]
