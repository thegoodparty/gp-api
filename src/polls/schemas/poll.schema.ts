import { z } from 'zod'

export const CreatePollSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  imageUrl: z.string().url().optional().nullable(),
})

export type CreatePollDto = z.infer<typeof CreatePollSchema>
