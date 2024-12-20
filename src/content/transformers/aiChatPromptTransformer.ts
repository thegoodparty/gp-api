import { Transformer, AIChatPrompt, AIChatPrompts } from '../content.types'

export const aiChatPromptsTransformer: Transformer<
  AIChatPrompt,
  AIChatPrompts
> = (prompts: AIChatPrompt[]): AIChatPrompts[] => {
  const aiChatPrompts = {}

  for (const prompt of prompts) {
    const { name } = prompt.data
    aiChatPrompts[name] = {
      ...prompt.data,
      id: prompt.id,
    }
  }
  return [aiChatPrompts]
}
