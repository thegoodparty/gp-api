import {
  Transformer,
  OnboardingPromptsAugmented,
  OnboardingPromptsRaw,
} from '../content.types'

export const onboardingPromptsTransformer: Transformer<
  OnboardingPromptsRaw,
  OnboardingPromptsAugmented
> = (prompts: OnboardingPromptsRaw[]): OnboardingPromptsAugmented[] =>
  prompts.map((prompt) => ({
    ...prompt.data,
  }))
