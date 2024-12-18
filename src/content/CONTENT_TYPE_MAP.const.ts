import { Content, ContentType } from '@prisma/client'
import { noOpTransformer } from './transformers/no-op-transformer'
import { faqArticlesTransformer } from './transformers/faqArticlesTransformer'
import { blogArticlesTransformer } from './transformers/blogArticlesTransformer'
import { articleTagsTransformer } from './transformers/articleTagsTransformer'
import { glossaryItemsTransformer } from './transformers/glossaryItemsTransformer'
import { candidateContentPromptsTransformer } from './transformers/candidateContentPromptsTransformer'
import { contentPromptsQuestionsTransformer } from './transformers/contentPromptsQuestionsTransformer'
import { aiContentCategoriesTransformer } from './transformers/aiContentCategoriesTransformer'
import { aiChatPromptsTransformer } from './transformers/aiChatPromptTransformer'
import { onboardingPromptsTransformer } from './transformers/onboardingPromptsTransformer'
import { promptInputFieldsTransformer } from './transformers/promptInputFieldsTransformer'
import { candidateTestimonialsTransformer } from './transformers/candidateTestimonialsTransformer'
import { articleCategoriesTransformer } from './transformers/articleCategoriesTransformer'
import { goodPartyTeamMembersTransformer } from './transformers/goodPartyTeamMembersTransformer'

export enum InferredContentTypes {
  articleTag = 'articleTag',
  candidateContentPrompts = 'candidateContentPrompts',
  contentPromptsQuestions = 'contentPromptsQuestions',
  aiContentCategories = 'aiContentCategories',
  aiChatPrompts = 'aiChatPrompts',
  articleCategories = 'articleCategories',
  candidateTestimonials = 'candidateTestimonials',
}

export const CONTENT_TYPE_MAP: {
  [key in ContentType | InferredContentTypes]: {
    name: ContentType | InferredContentTypes
    transformer: any
    inferredFrom?: ContentType | ContentType[]
  }
} = {
  aiChatPrompt: {
    name: ContentType.aiChatPrompt,
    transformer: noOpTransformer, // No transformation needed
  },
  aiChatPrompts: {
    name: InferredContentTypes.aiChatPrompts,
    transformer: aiChatPromptsTransformer,
    inferredFrom: ContentType.aiChatPrompt
  },
  aiContentCategories: {
    name: InferredContentTypes.aiContentCategories,
    transformer: aiContentCategoriesTransformer,
    inferredFrom: ContentType.aiContentTemplate
  },
  aiContentTemplate: { 
    name: ContentType.aiContentTemplate,
    transformer: noOpTransformer, // No transformation needed
  },
  articleCategory: {
    name: ContentType.articleCategory,
    transformer: noOpTransformer, // No transformation needed
  },
  articleCategories: {
    name: InferredContentTypes.articleCategories,
    transformer: articleCategoriesTransformer,
    inferredFrom: [ContentType.articleCategory, ContentType.faqArticle]
  },
  articleTag: {
    name: InferredContentTypes.articleTag,
    transformer: articleTagsTransformer,
    inferredFrom: ContentType.blogArticle,
  },
  blogArticle: {
    name: ContentType.blogArticle,
    transformer: blogArticlesTransformer,
  },
  blogHome: { name: ContentType.blogHome, transformer: noOpTransformer },
  blogSection: { name: ContentType.blogSection, transformer: noOpTransformer },
  candidateContentPrompts: {
    name: InferredContentTypes.candidateContentPrompts,
    transformer: candidateContentPromptsTransformer,
    inferredFrom: ContentType.aiContentTemplate
  },
  candidateTestimonial: {
    name: ContentType.candidateTestimonial,
    transformer: noOpTransformer, // No transformation needed
  },
  candidateTestimonials: {
    name: InferredContentTypes.candidateTestimonials,
    transformer: candidateTestimonialsTransformer,
    inferredFrom: ContentType.candidateTestimonial
  },
  contentPromptsQuestions: {
    name: InferredContentTypes.contentPromptsQuestions,
    transformer: contentPromptsQuestionsTransformer,
    inferredFrom: ContentType.aiContentTemplate
  },
  election: { 
    name: ContentType.election, 
    transformer: noOpTransformer // Previously supported
  },
  faqArticle: {
    name: ContentType.faqArticle,
    transformer: faqArticlesTransformer,
  },
  faqOrder: { 
    name: ContentType.faqOrder, 
    transformer: noOpTransformer 
  },
  glossaryItem: {
    name: ContentType.glossaryItem,
    transformer: glossaryItemsTransformer,
  },
  goodPartyTeamMembers: {
    name: ContentType.goodPartyTeamMembers,
    transformer: goodPartyTeamMembersTransformer,
  },
  onboardingPrompts: {
    name: ContentType.onboardingPrompts,
    transformer: onboardingPromptsTransformer,
  },
  pledge: { name: ContentType.pledge, transformer: noOpTransformer },
  privacyPage: { name: ContentType.privacyPage, transformer: noOpTransformer },
  promptInputFields: {
    name: ContentType.promptInputFields,
    transformer: promptInputFieldsTransformer,
  },
  redirects: { name: ContentType.redirects, transformer: noOpTransformer },
  teamMember: { name: ContentType.teamMember, transformer: noOpTransformer },
  teamMilestone: {
    name: ContentType.teamMilestone,
    transformer: noOpTransformer,
  },
  termsOfService: {
    name: ContentType.termsOfService,
    transformer: noOpTransformer,
  },
}
