import z from 'zod'
import { createSQSConsumer } from './utils/sqs-consumer'

export const handler = createSQSConsumer(
  {
    name: 'poll-response-analysis-queue-handler',
    reportBatchFailures: true,
    schema: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('poll-response-analysis'),
        data: z.any(),
      }),
      z.object({
        type: z.literal('poll-analysis-complete'),
        data: z.object({
          pollId: z.string(),
          confidence: z.enum(['low', 'high']),
        }),
      }),
    ]),
  },
  async (ctx) => {
    // TODO: put stuff in prisma
    ctx.logger.info('Poll response analysis')
  },
)
