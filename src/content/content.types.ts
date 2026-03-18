import { Content, ContentType, Prisma } from '@prisma/client'
import { InferredContentTypes } from './CONTENT_TYPE_MAP.const'
import { PinoLogger } from 'nestjs-pino'

export interface FindByTypeOptions {
  type: ContentType | InferredContentTypes
  orderBy?: Prisma.ContentOrderByWithRelationInput
  take?: number
  where?: Prisma.ContentWhereInput
  select?: Prisma.ContentSelect
  omit?: Prisma.ContentOmit
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
    taskOnly: boolean
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

export type CandidateContentPrompts = {
  [key: string]: string
}

export type ContentPromptsQuestions = {
  [key: string]: boolean
}

export type AIContentCategories = {
  name: string
  templates: AIContentCategoriesTemplateEntry[]
  order: number
}

export type AIContentCategoriesTemplateEntry = {
  key: string
  name: string
}

export type ContentRaw<T extends object = object> = Content & {
  data: object
} & T

export type ContentAugmented<T extends object = object> = T

export type Transformer<I = Content, O = ContentAugmented> = (
  content: I[],
  logger: PinoLogger,
) => O[] | O

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

export type PledgeRaw = {
  data: {
    [key: string]: string
  }
}

export type PledgeAugmented = {
  [key: string]: string
}
