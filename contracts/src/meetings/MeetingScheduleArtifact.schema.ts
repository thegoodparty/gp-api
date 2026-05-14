import { z } from 'zod'

export const MeetingScheduleSourceSchema = z.object({
  url: z.string().url(),
  note: z.string().optional(),
})

export type MeetingScheduleSource = z.infer<typeof MeetingScheduleSourceSchema>

export const MeetingScheduleArtifactSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('not_found'),
    sources: z.array(MeetingScheduleSourceSchema).default([]),
  }),
  z.object({
    status: z.literal('found'),
    rrule: z.string().min(1),
    human: z.string().min(1),
    time: z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/),
    timezone: z.string().min(1),
    durationMinutes: z.number().int().min(1),
    sources: z.array(MeetingScheduleSourceSchema).default([]),
  }),
])

export type MeetingScheduleArtifact = z.infer<
  typeof MeetingScheduleArtifactSchema
>
