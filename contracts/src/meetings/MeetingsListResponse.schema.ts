import { z } from 'zod'

export const MeetingItemSchema = z.object({
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meetingTime: z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/),
  meetingTimezone: z.string(),
  durationMinutes: z.number().int().min(1),
  hasBriefing: z.boolean(),
})

export type MeetingItem = z.infer<typeof MeetingItemSchema>

export const MeetingsListResponseSchema = z.object({
  scheduleKnown: z.boolean(),
  meetings: z.array(MeetingItemSchema),
})

export type MeetingsListResponse = z.infer<typeof MeetingsListResponseSchema>
