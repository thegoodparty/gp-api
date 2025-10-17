import z from 'zod'
import { createSQSConsumer } from './utils/sqs-consumer'

export const handler = createSQSConsumer(
  {
    name: 'poll-response-analysis-queue-handler',
    reportBatchFailures: true,
    schema: z.object({}),
  },
  async (ctx) => {
    const polls = await ctx.prisma.poll.findMany({ take: 50 })
    ctx.logger.info('Fetched polls', { polls })
  },
)
