import { ContentType } from '@prisma/client'
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
import { termsOfServiceTransformer } from './transformers/termsOfServiceTransformer'
import { redirectsTransformer } from './transformers/redirectsTransformer'
import { blogHomeTransformer } from './transformers/blogHomeTransformer'
import { blogSectionsTransformer } from './transformers/blogSectionsTransformer'
import { pledgeTransformer } from './transformers/pledgeTransformer'
import { privacyPageTransformer } from './transformers/privacyPageTransformer'
import { blogArticleTitlesTransformer } from './transformers/blogArticleTitlesTransformer'

export enum InferredContentTypes {
  articleTag = 'articleTag',
  candidateContentPrompts = 'candidateContentPrompts',
  contentPromptsQuestions = 'contentPromptsQuestions',
  aiContentCategories = 'aiContentCategories',
  aiChatPrompts = 'aiChatPrompts',
  articleCategories = 'articleCategories',
  candidateTestimonials = 'candidateTestimonials',
  blogSections = 'blogSections',
  blogArticleTitles = 'blogArticleTitles',
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
    inferredFrom: ContentType.aiChatPrompt,
  },
  aiContentCategories: {
    name: InferredContentTypes.aiContentCategories,
    transformer: aiContentCategoriesTransformer,
    inferredFrom: ContentType.aiContentTemplate,
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
    inferredFrom: [ContentType.articleCategory, ContentType.faqArticle],
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
  blogArticleTitles: {
    name: InferredContentTypes.blogArticleTitles,
    transformer: blogArticleTitlesTransformer,
    inferredFrom: ContentType.blogArticle,
  },
  blogHome: {
    name: ContentType.blogHome,
    transformer: blogHomeTransformer,
  },
  blogSection: {
    name: ContentType.blogSection,
    transformer: noOpTransformer, // No transformation needed
  },
  blogSections: {
    name: InferredContentTypes.blogSections,
    transformer: blogSectionsTransformer,
    inferredFrom: [ContentType.blogSection, ContentType.blogArticle],
  },
  candidateContentPrompts: {
    name: InferredContentTypes.candidateContentPrompts,
    transformer: candidateContentPromptsTransformer,
    inferredFrom: ContentType.aiContentTemplate,
  },
  candidateTestimonial: {
    name: ContentType.candidateTestimonial,
    transformer: noOpTransformer, // No transformation needed
  },
  candidateTestimonials: {
    name: InferredContentTypes.candidateTestimonials,
    transformer: candidateTestimonialsTransformer,
    inferredFrom: ContentType.candidateTestimonial,
  },
  contentPromptsQuestions: {
    name: InferredContentTypes.contentPromptsQuestions,
    transformer: contentPromptsQuestionsTransformer,
    inferredFrom: ContentType.aiContentTemplate,
  },
  election: {
    name: ContentType.election,
    transformer: noOpTransformer, // Previously supported
  },
  faqArticle: {
    name: ContentType.faqArticle,
    transformer: faqArticlesTransformer,
  },
  faqOrder: {
    name: ContentType.faqOrder,
    transformer: noOpTransformer, // No longer supported
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
  pledge: {
    name: ContentType.pledge,
    transformer: pledgeTransformer,
  },
  privacyPage: {
    name: ContentType.privacyPage,
    transformer: privacyPageTransformer,
  },
  promptInputFields: {
    name: ContentType.promptInputFields,
    transformer: promptInputFieldsTransformer,
  },
  redirects: {
    name: ContentType.redirects,
    transformer: redirectsTransformer,
  },
  teamMember: { name: ContentType.teamMember, transformer: noOpTransformer }, // Not supported
  teamMilestone: {
    name: ContentType.teamMilestone,
    transformer: noOpTransformer, // Previously supported
  },
  termsOfService: {
    name: ContentType.termsOfService,
    transformer: termsOfServiceTransformer,
  },
}
