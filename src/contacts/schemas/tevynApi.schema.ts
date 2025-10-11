import { z } from 'zod'

export const TevynApiSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  csvFileUrl: z.string().url().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  createPoll: z.boolean().optional().default(false),
})

export type TevynApiDto = z.infer<typeof TevynApiSchema>
