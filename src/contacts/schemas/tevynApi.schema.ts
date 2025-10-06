import { z } from 'zod'

export const TevynApiSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  csvFileUrl: z.string().url().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
})

export type TevynApiDto = z.infer<typeof TevynApiSchema>
