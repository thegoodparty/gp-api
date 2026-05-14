import { z } from 'zod'

export const MeetingDateParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  }),
})

export type MeetingDateParam = z.infer<typeof MeetingDateParamSchema>
