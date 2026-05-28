import { z } from 'zod'

export const BriefingItemParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  }),
  itemId: z.string().min(1),
})

export type BriefingItemParam = z.infer<typeof BriefingItemParamSchema>
