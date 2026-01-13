import { EventSchemas, Inngest } from 'inngest'
import { PollAnalysisCompleteEventSchema } from '../queue/queue.types'

// Define event schemas for type safety
type Events = {
  'poll/analysis.complete': {
    data: {
      pollId: string
      totalResponses: number
      issues: Array<{
        pollId: string
        rank: number
        theme: string
        summary: string
        analysis: string
        responseCount: number
        quotes: Array<{ quote: string; phone_number: string }>
      }>
    }
  }
}

export const inngest = new Inngest({
  id: process.env.INNGEST_APP_ID || 'gp-api',
  schemas: new EventSchemas().fromZod<Events>([
    {
      name: 'poll/analysis.complete' as const,
      schema: PollAnalysisCompleteEventSchema.shape.data,
    },
  ]),
  // Event key for authentication (sending events from API)
  eventKey: process.env.INNGEST_EVENT_KEY,
  // Signing key for webhook verification (receiving events in worker)
  ...(process.env.INNGEST_SIGNING_KEY && {
    signingKey: process.env.INNGEST_SIGNING_KEY,
  }),

  // Environment-specific configuration
  ...(process.env.NODE_ENV === 'development' && {
    // Point to local Inngest dev server
    baseUrl: process.env.INNGEST_DEV_SERVER_URL || 'http://inngest:3001',
  }),
})
