import { Block, Inline } from '@contentful/rich-text-types'
import { EntrySys, FieldsType } from 'contentful'
import { BlogArticleMeta, Content, ContentType, Prisma } from '@prisma/client'
import { InferredContentTypes } from './CONTENT_TYPE_MAP.const'

export const TYPE_FAQ_ARTICLE = 'faqArticle'
export const TYPE_ARTICLE_CATEGORY = 'articleCategory'
export const TYPE_BLOG_SECTION = 'blogSection'
export const TYPE_BLOG_ARTICLE = 'blogArticle'

export interface findByTypeOptions {
  type: ContentType | InferredContentTypes
  orderBy?: Prisma.ContentOrderByWithRelationInput
  take?: number
  where?: Prisma.ContentWhereInput
  select?: Prisma.ContentSelect
  omit?: Prisma.ContentOmit
}

export interface ImageRaw {
  fields: {
    file: {
      url: string
      details?: {
        size?: number
        image?: {
          width: number
          height: number
        }
      }
    }
    title?: string
  }
}

export interface ImageClean {
  url: string
  alt?: string
  size?: {
    width: number
    height: number
  } | null
}

export type AIContentTemplateRaw = {
  createdAt: Date
  updatedAt: Date
  id: string
  type: string
  data: {
    name: string
    content: string
    category: {
      fields: {
        order: number
        title: string
      }
    }
    requiresAdditionalQuestions: boolean
  }
}

export type AIChatPrompt = {
  createdAt: Date
  updatedAt: Date
  id: string
  type: string
  data: AIChatPromptContents
}

export type AIChatPrompts = {
  [key: string]: AIChatPromptContentsWithId
}

export type AIChatPromptContents = {
  name: string
  systemPrompt: string
  initialPrompt: string
  candidateJson: object
}

export type AIChatPromptContentsWithId = AIChatPromptContents & {
  id: string
}

export type AIContentTemplateAugmented = {
  id: string
  name: string
  content: string
  category: {
    title: string
    order: number
  }
  requiresAdditionalQuestions: boolean
}

type ArticleFaq = {
  sys: {
    id: string
  }
  fields: {
    title: string
  }
}

export type ArticleSlugsByTag = {
  [key: string]: {
    tagName: string
    articleSlugs: string[]
  }
}

export type CandidateContentPrompts = {
  [key: string]: string // Multiple entries of key: templateName, value: templateBody (names I made up)
}

export type ContentPromptsQuestions = {
  [key: string]: boolean // Multiple entries of key: templateName, value: boolean
}

export type AIContentCategories = {
  name: string
  templates: AIContentCategoriesTemplateEntry[]
  order: number
}

export type ArticleCategories = {
  fields: {
    name: string
    order: number
  }
  id: string | null
  name: string
  articles: ArticleFields[]
  order: number
}

type ArticleFields = {
  title: string
  id: string
}

export type ArticleCategoryRaw = {
  id: string
  type: 'articleCategory'
  data: {
    name: string
    order: 1
  }
}

export type AIContentCategoriesTemplateEntry = {
  key: string
  name: string
}

export type BlogArticleAuthorFieldsRaw = {
  name: string
  summary: string
  image?: ImageRaw
}

export type BlogArticleAuthorRaw = {
  fields: BlogArticleAuthorFieldsRaw
}

export type BlogArticleBannerRaw = {
  fields: {
    largeImage: ImageRaw
    smallImage: ImageRaw
  }
}

type BlogArticleBanner = {
  largeImage: ContentMedia
  smallImage: ContentMedia
}

export type BlogArticleContentRaw = ContentRaw<{
  type: 'blogArticle'
  data: {
    title: string
    body: Block | Inline
    author: BlogArticleAuthorRaw
    banner: BlogArticleBannerRaw
    mainImage: ImageRaw
    tags: BlogArticleTagRaw[]
    section: BlogArticleSectionRaw
    relatedArticles: BlogArticleRelatedArticleRaw[]
    references: BlogArticleReferenceRaw[]
    publishDate: string
    slug: string
    summary: string
  }
}>

export type BlogArticleAugmented = ContentAugmented<
  FieldsType & {
    id: string
    text: string
    updateDate: Date | null
    tags: PrismaJson.BlogArticleTag[]
    mainImage: ContentMedia
    author?: PrismaJson.BlogArticleAuthor
    banner?: BlogArticleBanner
    relatedArticles?: RelatedArticle[]
    references?: PrismaJson.BlogArticleReference[]
    section?: BlogArticleSection
    slug: string
    title: string
    publishDate: string
    summary: string
  }
>

export type BlogArticleReferenceRaw = {
  fields: FieldsType
}

export type BlogArticleRelatedArticleRaw = {
  sys: EntrySys
  fields: FieldsType & {
    mainImage: ImageRaw
  }
}

type RelatedArticle = {
  mainImage: ContentMedia
}

export type BlogArticleSectionRaw = {
  sys: EntrySys
  fields: FieldsType
}

type BlogArticleSection = {
  id: string
  fields: FieldsType
}

export type BlogArticleTagRaw = {
  fields: {
    name: string
  }
}

export type BlogArticlesTagsMap = Map<string, PrismaJson.BlogArticleTag>

export type BlogSectionRaw = {
  id: string
  type: 'blogSection'
  sys: {
    id: string
  }
  data: {
    slug: string
    order: number
    title: string
    subtitle: string
  }
}

export type BlogSection = {
  fields: {
    title: string
    subtitle: string
    slug: string
    order: number
  }
  id: string
  slug: string
  tags: []
  articles: BlogArticleHighlight[] | undefined
  order: number
}

type BlogArticleHighlight = {
  title: string
  id: string
  mainImage: ImageClean
  publishDate: string
  slug: string
  summary: string
}

export type BlogArticlePreview1 = {
  title: string
  mainImage: ImageClean
  slug: string
  publishDate: string
  summary: string
}

export type BlogArticlePreview2 = {
  // Key is a slug
  [key: string]: {
    title: string
    summary: string
    slug: string
  }
}

export type BlogArticleTitle = {
  title: string
  slug: string
}

export type BlogArticlePreprocessed = Omit<
  BlogArticleMeta,
  'id' | 'createdAt' | 'updatedAt'
>

export type ContentMedia = {
  url: string
  alt: string
  size: {
    width: number
    height: number
  }
}

export type BlogHomeRaw = {
  data: {
    topTags: BlogArticleTagRaw[]
    articleFaqs: ArticleFaq[]
  }
}

export type BlogHomeAugmented = {
  tags: PrismaJson.BlogArticleTag[]
  faqs: FaqBasic[]
}

export type ContentRaw<T extends object = object> = Content & {
  data: object
} & T

export type ContentAugmented<T extends object = object> = T

export type CandidateTestimonialAugmented = {
  name: string
  office: string
  image: ImageClean
  testimonial: string
}

export type CandidateTestimonalRaw = {
  data: {
    name: string
    image: ImageRaw
    office: string
    testimonial: string
  }
}

export type FaqArticleCategoryRaw = {
  sys: {
    id: string
  }
  fields: {
    name: string
    order?: number
  }
}

type FaqBasic = {
  title: string
  id: string
}

export type OnboardingPromptsAugmented = {
  slogan: string
  why: string
  aboutMe: string
  policyPlatform: string
  communicationsStrategy: string
  messageBox: string
  pathToVictory: string
  mobilizing: string
  getOutTheVote: string
  operationalPlan: string
  timeline: string
  searchForOffice: string
}

export type OnboardingPromptsRaw = {
  createdAt: Date
  updatedAt: Date
  id: number
  type: string
  data: OnboardingPromptsAugmented
}

export type PromptInputFieldsRaw = {
  createdAt: Date
  updatedAt: Date
  id: number
  type: string
  data: {
    fieldId: string
    contentInput: ContentInput[]
  }
}

export type ContentInput = {
  fields: PromptInputQuestion
}

export type PromptInputQuestion = {
  title: string
  helperText: string
}

export type PromptInputFieldsAugmented = {
  [key: string]: PromptInputQuestion[]
}

type FaqArticleContentRawData = {
  type: 'faqArticle'
  id: string
  data: {
    title: string
    category?: FaqArticleCategoryRaw[]
  }
}

export type FaqArticleContentRaw = ContentRaw<FaqArticleContentRawData>

export type FaqArticleContentAugmented = ContentAugmented<
  Partial<Content> & {
    category?: {
      id: string
      fields: {
        name: string
        order?: number
      }
    }
  }
>

export type Transformer<I = Content, O = ContentAugmented> = (
  content: I[],
) => O[] | O

type GlossaryItemRawData = {
  data: FieldsType & {
    title: string
  }
}
export type GlossaryItemRaw = ContentRaw<GlossaryItemRawData>
export type GlossaryItemAugmented = ContentAugmented<
  Partial<Content> & {
    slug: string
  }
> &
  FieldsType

export type GoodPartyTeamMembersRaw = {
  data: {
    name: string
    members: TeamMember[]
  }
}

export type TeamMember = {
  sys: {
    id: string
  }
  fields: {
    role: string
    fullName: string
    goodPhoto: ImageRaw
    partyRole: string
    partyPhoto: ImageRaw
  }
}

export type GoodPartyTeamMembersAugmented = {
  fullName: string
  role: string
  goodPhoto: ImageClean
  partyPhoto: ImageClean
  partyRole: string
  id: string
}

export type PledgeRaw = {
  data: {
    [key: string]: string
  }
}

export type PledgeAugmented = {
  [key: string]: string
}

export type PrivacyPageRaw = {
  data: {
    [key: string]: string
  }
}

export type PrivacyPageAugmented = {
  [key: string]: string
}

export type RedirectsRaw = {
  data: {
    pathname: string
    redirectUrl: string
  }
}

export type RedirectsAugmented = {
  [key: string]: string // Key is the pathname, value is the redirectUrl
}

export type TermsOfServiceRaw = {
  data: {
    [key: string]: string
  }
}

export type TermsOfServiceAugmented = {
  [key: string]: string
}

export type BlogArticlesSectionAugmented = {
  slug?: string
  articles: BlogArticleMeta[]
} & PrismaJson.BlogArticleSection

export type BlogSectionHero = {
  section?: PrismaJson.BlogArticleSection
} & Partial<BlogArticleMeta>

export type SpecificSectionResponseDatum = Omit<
  BlogArticlesSectionAugmented,
  'articles'
> & {
  articles?: BlogArticleMeta[]
}
