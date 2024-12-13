import { Block, Inline } from '@contentful/rich-text-types'
import { EntrySys, FieldsType, Metadata, Asset } from 'contentful'
import { Content } from '@prisma/client'

export interface ImageRaw {
  fields: {
    file: {
      url: string
      details?: {
        image?: {
          width: number
          height: number
        }
      }
    }
    title?: string
  }
}

export type AIContentTemplateRaw = {
  createdAt: Date,
  updatedAt: Date,
  id: string,
  type: string,
  data: {
    name: string,
    content: string,
    category: {
      fields: {
        order: number,
        title: string,
      }
    },
    requiresAdditionalQuestions: boolean
  }
}

export type AIChatPrompt = {
  createdAt: Date,
  updatedAt: Date,
  id: string,
  type: string,
  data: AIChatPromptContents
}

export type AIChatPrompts = {
  [key: string]: AIChatPromptContentsWithId
}

export type AIChatPromptContents = {
  name: string;
  systemPrompt: string;
  initialPrompt: string;
  candidateJson: object;
}

export type AIChatPromptContentsWithId = AIChatPromptContents & {
  id: number;
}

export type AIContentTemplateAugmented = {
  id: string;
  name: string;
  content: string;
  category: {
    title: string;
    order: number;
  };
  requiresAdditionalQuestions: boolean;
}

export type CandidateContentPrompts = {
  [key: string]: string; // Multiple entries of key: templateName, value: templateBody (names I made up)
}

export type ContentPromptsQuestions = { // The use unknown
  [key: string]: boolean; // Multiple entries of key: templateName, value: boolean
}

export type AIContentCategories = {
  name: string;
  templates: AIContentCategoriesTemplateEntry[];
  order: number;
}

export type AIContentCategoriesTemplateEntry = {
  key: string;
  name: string;
}

export type BlogArticleAuthorFieldsRaw = {
  name: string
  summary: string
  image?: ImageRaw
}

export type BlogArticleAuthorRaw = {
  fields: BlogArticleAuthorFieldsRaw
}

type BlogArticleAuthorFields = {
  image?: ContentMedia
}

export type BlogArticleAuthor = {
  fields: BlogArticleAuthorFields
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
  data: {
    body: Block | Inline
    author: BlogArticleAuthorRaw
    banner: BlogArticleBannerRaw
    mainImage: ImageRaw
    tags: BlogArticleTagRaw[]
    section: BlogArticleSectionRaw
    relatedArticles: BlogArticleRelatedArticleRaw[]
    references: BlogArticleReferenceRaw[]
  }
}>

export type BlogArticleAugmented = ContentAugmented<
  FieldsType & {
    id: string
    text: string
    updateDate: Date | null
    tags: BlogArticleTag[]
    mainImage: ContentMedia
    author?: BlogArticleAuthor
    banner?: BlogArticleBanner
    relatedArticles?: RelatedArticle[]
    references?: BlogArticleReference[]
    section?: BlogArticleSection
  }
>

export type BlogArticleReferenceRaw = {
  fields: FieldsType
}

export type BlogArticleReference = {
  url: string
  name: string
  description: string
}

export type BlogArticleRelatedArticleRaw = {
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

export type BlogArticleTag = {
  slug: string
  name: string
}

export type BlogArticlesTagsMap = Map<string, BlogArticleTag>

export type ContentMedia = {
  url: string
  alt: string
  size: {
    width: number
    height: number
  }
}

export type ContentRaw<T extends object = {}> = Content & { data: object } & T

export type ContentAugmented<T extends object = {}> = T

export type FaqArticleCategoryRaw = {
  sys: {
    id: string
  }
  fields: {
    name: string
    order?: number
  }
}

type FaqArticleContentRawData = {
  data: {
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
) => O[]

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
