import { z } from 'zod'

export const BriefingSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['internal', 'official', 'news', 'other']),
  iconInitial: z.string().length(1),
  url: z.string().url().nullable(),
})

export type BriefingSource = z.infer<typeof BriefingSourceSchema>

export const BriefingAgendaItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['procedural', 'action', 'discussion', 'other']),
  hasBriefing: z.boolean(),
})

export type BriefingAgendaItem = z.infer<typeof BriefingAgendaItemSchema>

export const BriefingActionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  overview: z.string(),
  constituentSentiment: z
    .object({
      summary: z.string(),
      detail: z.string(),
      sources: z.array(z.string()),
    })
    .optional(),
  recentNews: z
    .array(
      z.object({
        title: z.string(),
        outlet: z.string(),
        url: z.string().url(),
      }),
    )
    .default([]),
  budgetImpact: z
    .object({
      summary: z.string(),
      sources: z.array(BriefingSourceSchema).default([]),
    })
    .optional(),
  talkingPoints: z.array(z.string()).default([]),
  sources: z.array(BriefingSourceSchema).default([]),
})

export type BriefingActionItem = z.infer<typeof BriefingActionItemSchema>

export const MeetingBriefingResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  meetingId: z.string(),
  title: z.string(),
  meetingDate: z.string(),
  status: z.literal('briefing_ready'),
  readingTimeMinutes: z.number().int().min(0),
  generatedAt: z.string(),
  meeting: z.object({
    id: z.string(),
    name: z.string(),
    body: z.string(),
    type: z.string(),
    scheduledAt: z.string(),
    location: z.string(),
  }),
  executiveSummary: z.string(),
  agenda: z.array(BriefingAgendaItemSchema),
  actionItems: z.array(BriefingActionItemSchema),
})

export type MeetingBriefingResponse = z.infer<
  typeof MeetingBriefingResponseSchema
>
