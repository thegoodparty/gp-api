import { z } from 'zod'

const PriorityIssueGuidanceSchema = z.object({
  headline: z.string(),
  whatYouNeedToDo: z.string(),
  askThisInTheRoom: z.string(),
  tryThis: z.string().nullable(),
  actionButtons: z.array(z.unknown()),
})

const PriorityIssueAnalysisSchema = z.object({
  whatIsHappening: z.string(),
  whatDecision: z.string(),
  whyItMatters: z.string(),
  recommendation: z.string(),
  actionItem: z.string(),
  askThis: z.string(),
  tryThis: z.string().nullable(),
  whoIsPresenting: z.string(),
  supportingContext: z.string().nullable(),
  supportingDocuments: z.array(z.object({ name: z.string(), url: z.string() })),
})

const PriorityIssueSchema = z.object({
  number: z.number(),
  slug: z.string(),
  agendaItemTitle: z.string(),
  category: z.string(),
  card: PriorityIssueGuidanceSchema,
  detail: PriorityIssueAnalysisSchema.optional(),
})

const FullAgendaItemSchema = z.object({
  number: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  isPriority: z.boolean().optional(),
  priorityNumber: z.number().optional(),
})

export const BriefingSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  generationModel: z.string(),
  generationCostUsd: z.number().optional(),

  meeting: z.object({
    citySlug: z.string(),
    cityName: z.string(),
    state: z.string(),
    body: z.string(),
    date: z.string(),
    time: z.string().nullable(),
    title: z.string(),
    readTime: z.string(),
    sourceUrl: z.string().nullable(),
    sourceType: z.string(),
  }),

  executiveSummary: z.object({
    headline: z.string(),
    subheadline: z.string(),
    priorityItemCount: z.number(),
    totalAgendaItems: z.number(),
  }),

  priorityIssues: z.array(PriorityIssueSchema),
  fullAgenda: z.array(FullAgendaItemSchema),
  fullAgendaSummary: z.string(),

  constituentData: z.object({
    available: z.boolean(),
    voterCount: z.number().nullable(),
    topIssues: z.array(
      z.object({ name: z.string(), score: z.number(), tier: z.string() }),
    ),
    ideology: z.record(z.number()).nullable(),
  }),

  footer: z.object({
    preparedBy: z.string(),
    contactNote: z.string(),
  }),
})
