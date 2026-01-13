import {
  OnboardingPromptsAugmented,
  OnboardingPromptsRaw,
  Transformer,
} from '../content.types'

export const onboardingPromptsTransformer: Transformer<
  OnboardingPromptsRaw,
  OnboardingPromptsAugmented
> = (prompts: OnboardingPromptsRaw[]): OnboardingPromptsAugmented[] =>
  prompts.map((prompt) => ({
    ...prompt.data,
  }))
