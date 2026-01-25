import { Inngest, EventSchemas } from 'inngest'
import { z } from 'zod'

export const PollAnalysisCompleteSchema = z.object({
  pollId: z.string(),
  totalResponses: z.number(),
  issues: z.array(
    z.object({
      pollId: z.string(),
      rank: z.number().min(1).max(3),
      theme: z.string(),
      summary: z.string(),
      analysis: z.string(),
      responseCount: z.number(),
      quotes: z.array(
        z.object({ quote: z.string(), phone_number: z.string() }),
      ),
    }),
  ),
})

export type PollAnalysisCompleteData = z.infer<
  typeof PollAnalysisCompleteSchema
>

export const PollCreationSchema = z.object({
  pollId: z.string(),
})

export type PollCreationData = z.infer<typeof PollCreationSchema>

export type InngestEvents = {
  'polls/analysis.complete': {
    data: PollAnalysisCompleteData
  }
  'polls/created': {
    data: PollCreationData
  }
}

export const inngest = new Inngest({
  id: 'gp-api',
  schemas: new EventSchemas().fromZod({
    'polls/analysis.complete': {
      data: PollAnalysisCompleteSchema,
    },
    'polls/created': {
      data: PollCreationSchema,
    },
  }),
})
