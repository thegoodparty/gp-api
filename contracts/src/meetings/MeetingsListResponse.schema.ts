import { z } from 'zod'

export const MeetingItemSchema = z.object({
  meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meeting_time: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
  meeting_timezone: z.string(),
  duration_minutes: z.number().int().min(1),
  has_briefing: z.boolean(),
})

export type MeetingItem = z.infer<typeof MeetingItemSchema>

export const MeetingsListResponseSchema = z.object({
  schedule_known: z.boolean(),
  meetings: z.array(MeetingItemSchema),
})

export type MeetingsListResponse = z.infer<typeof MeetingsListResponseSchema>
