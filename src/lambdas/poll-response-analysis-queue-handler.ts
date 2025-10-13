import z from 'zod'
import {
  PollResponseInsight,
  uploadPollResultData,
} from 'src/polls/dynamo-helpers'
import { createSQSConsumer } from './utils/sqs-consumer'

export const handler = createSQSConsumer(
  {
    name: 'poll-response-analysis-queue-handler',
    reportBatchFailures: true,
    schema: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('poll-response-analysis'),
        data: PollResponseInsight,
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
  async (_, event) => {
    switch (event.type) {
      case 'poll-response-analysis':
        await uploadPollResultData(event.data)
        break
      case 'poll-analysis-complete':
        // todo: handle poll complete
        break
    }
  },
)
