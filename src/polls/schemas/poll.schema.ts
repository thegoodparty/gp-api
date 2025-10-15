import { z } from 'zod'

export const PollSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  imageUrl: z.string().url().optional().nullable(),
})

export const PollInitialSchema = PollSchema.extend({
  csvFileUrl: z.string().url().optional().nullable(),
  createPoll: z.boolean(),
})

export type PollDto = z.infer<typeof PollSchema>
export type PollInitialDto = z.infer<typeof PollInitialSchema>
