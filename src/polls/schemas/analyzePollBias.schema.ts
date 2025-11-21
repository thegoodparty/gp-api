import { z } from 'zod'

export const AnalyzePollBiasSchema = z.object({
  pollText: z.string().min(1, 'Poll text is required'),
})

export type AnalyzePollBiasDto = z.infer<typeof AnalyzePollBiasSchema>
