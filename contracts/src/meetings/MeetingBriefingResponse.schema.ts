import { z } from 'zod'

export const BriefingSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['internal', 'official', 'news', 'other']),
  icon_initial: z.string().length(1),
  url: z.string().url().nullable(),
})

export type BriefingSource = z.infer<typeof BriefingSourceSchema>

export const BriefingAgendaItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['procedural', 'action', 'discussion', 'other']),
  has_briefing: z.boolean(),
})

export type BriefingAgendaItem = z.infer<typeof BriefingAgendaItemSchema>

export const BriefingActionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  overview: z.string(),
  constituent_sentiment: z
    .object({
      summary: z.string(),
      detail: z.string(),
      sources: z.array(z.string()),
    })
    .optional(),
  recent_news: z
    .array(
      z.object({
        title: z.string(),
        outlet: z.string(),
        url: z.string().url(),
      }),
    )
    .default([]),
  budget_impact: z
    .object({
      summary: z.string(),
      sources: z.array(BriefingSourceSchema).default([]),
    })
    .optional(),
  talking_points: z.array(z.string()).default([]),
  sources: z.array(BriefingSourceSchema).default([]),
})

export type BriefingActionItem = z.infer<typeof BriefingActionItemSchema>

export const MeetingBriefingResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  meeting_id: z.string(),
  title: z.string(),
  meeting_date: z.string(),
  status: z.literal('briefing_ready'),
  reading_time_minutes: z.number().int().min(0),
  generated_at: z.string(),
  meeting: z.object({
    id: z.string(),
    name: z.string(),
    body: z.string(),
    type: z.string(),
    scheduled_at: z.string(),
    location: z.string(),
  }),
  executive_summary: z.string(),
  agenda: z.array(BriefingAgendaItemSchema),
  action_items: z.array(BriefingActionItemSchema),
})

export type MeetingBriefingResponse = z.infer<
  typeof MeetingBriefingResponseSchema
>
