import { EventSchemas, Inngest } from 'inngest'
import { z } from 'zod'

export const inngest = new Inngest({
  id: 'gp-api',
  schemas: new EventSchemas().fromZod({
    'polls/creation.requested': {
      data: z.object({
        pollId: z.string(),
      }),
    },
    'polls/expansion.requested': {
      data: z.object({
        pollId: z.string(),
      }),
    },
  }),
})
