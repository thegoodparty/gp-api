import { ContentType } from '@prisma/client'
import { noOpTransformer } from './transformers/no-op-transformer'
import { candidateContentPromptsTransformer } from './transformers/candidateContentPromptsTransformer'
import { contentPromptsQuestionsTransformer } from './transformers/contentPromptsQuestionsTransformer'
import { aiContentCategoriesTransformer } from './transformers/aiContentCategoriesTransformer'
import { aiChatPromptsTransformer } from './transformers/aiChatPromptTransformer'
import { onboardingPromptsTransformer } from './transformers/onboardingPromptsTransformer'
import { promptInputFieldsTransformer } from './transformers/promptInputFieldsTransformer'
import { pledgeTransformer } from './transformers/pledgeTransformer'

export enum InferredContentTypes {
  candidateContentPrompts = 'candidateContentPrompts',
  contentPromptsQuestions = 'contentPromptsQuestions',
  aiContentCategories = 'aiContentCategories',
  aiChatPrompts = 'aiChatPrompts',
}

export const CONTENT_TYPE_MAP: {
  [key in ContentType | InferredContentTypes]: {
    name: ContentType | InferredContentTypes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transformer: any
    inferredFrom?: ContentType | ContentType[]
  }
} = {
  aiChatPrompt: {
    name: ContentType.aiChatPrompt,
    transformer: noOpTransformer,
  },
  aiChatPrompts: {
    name: InferredContentTypes.aiChatPrompts,
    transformer: aiChatPromptsTransformer,
    inferredFrom: ContentType.aiChatPrompt,
  },
  aiContentCategories: {
    name: InferredContentTypes.aiContentCategories,
    transformer: aiContentCategoriesTransformer,
    inferredFrom: ContentType.aiContentTemplate,
  },
  aiContentTemplate: {
    name: ContentType.aiContentTemplate,
    transformer: noOpTransformer,
  },
  candidateContentPrompts: {
    name: InferredContentTypes.candidateContentPrompts,
    transformer: candidateContentPromptsTransformer,
    inferredFrom: ContentType.aiContentTemplate,
  },
  contentPromptsQuestions: {
    name: InferredContentTypes.contentPromptsQuestions,
    transformer: contentPromptsQuestionsTransformer,
    inferredFrom: ContentType.aiContentTemplate,
  },
  onboardingPrompts: {
    name: ContentType.onboardingPrompts,
    transformer: onboardingPromptsTransformer,
  },
  pledge: {
    name: ContentType.pledge,
    transformer: pledgeTransformer,
  },
  promptInputFields: {
    name: ContentType.promptInputFields,
    transformer: promptInputFieldsTransformer,
  },
}
