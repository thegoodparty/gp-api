import { ContentType } from '@prisma/client'
import { noOpTransformer } from './transformers/no-op-transformer'
import { faqArticleTransformer } from './transformers/faqArticleTransformer'
import { Transformer } from './content.types'
import { blogArticleTransformer } from './transformers/blogArticleTransformer'

export const CONTENT_TYPE_MAP: {
  [key: string]: { name: ContentType; transformer: Transformer }
} = {
  aiChatPrompt: {
    name: ContentType.aiChatPrompt,
    transformer: noOpTransformer,
  },
  aiContentTemplate: {
    name: ContentType.aiContentTemplate,
    transformer: noOpTransformer,
  },
  articleCategory: {
    name: ContentType.articleCategory,
    transformer: noOpTransformer,
  },
  blogArticle: {
    name: ContentType.blogArticle,
    transformer: blogArticleTransformer,
  },
  blogHome: { name: ContentType.blogHome, transformer: noOpTransformer },
  blogSection: { name: ContentType.blogSection, transformer: noOpTransformer },
  candidateTestimonial: {
    name: ContentType.candidateTestimonial,
    transformer: noOpTransformer,
  },
  election: { name: ContentType.election, transformer: noOpTransformer },
  faqArticle: {
    name: ContentType.faqArticle,
    transformer: faqArticleTransformer,
  },
  faqOrder: { name: ContentType.faqOrder, transformer: noOpTransformer },
  glossaryItem: {
    name: ContentType.glossaryItem,
    transformer: noOpTransformer,
  },
  goodPartyTeamMembers: {
    name: ContentType.goodPartyTeamMembers,
    transformer: noOpTransformer,
  },
  onboardingPrompts: {
    name: ContentType.onboardingPrompts,
    transformer: noOpTransformer,
  },
  pledge: { name: ContentType.pledge, transformer: noOpTransformer },
  privacyPage: { name: ContentType.privacyPage, transformer: noOpTransformer },
  promptInputFields: {
    name: ContentType.promptInputFields,
    transformer: noOpTransformer,
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
