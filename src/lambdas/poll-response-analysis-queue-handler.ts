import z from 'zod'
import {
  PollResponseInsight,
  uploadPollResultData,
} from 'src/polls/dynamo-helpers'
import { createSQSConsumer } from './utils/sqs-consumer'
import { SQS } from '@aws-sdk/client-sqs'
import { createMonolithQueueMessage } from 'src/queue/producer/queueProducer.service'
import {
  MessageGroup,
  PollAnalysisCompleteMessage,
  QueueType,
} from 'src/queue/queue.types'

const sqs = new SQS()

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
          totalResponses: z.number(),
        }),
      }),
    ]),
  },
  async (_, event) => {
    const monolithQueueUrl = process.env.MONOLITH_QUEUE_URL

    switch (event.type) {
      case 'poll-response-analysis':
        await uploadPollResultData(event.data)
        break
      case 'poll-analysis-complete':
        const data: PollAnalysisCompleteMessage = {
          pollId: event.data.pollId,
          totalResponses: event.data.totalResponses,
        }
        const message = createMonolithQueueMessage(
          { type: QueueType.POLL_ANALYSIS_COMPLETE, data },
          MessageGroup.default,
        )
        await sqs.sendMessage({
          QueueUrl: monolithQueueUrl,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          MessageBody: message.body,
          MessageGroupId: message.groupId,
          MessageDeduplicationId: message.deduplicationId,
        })
        break
    }
  },
)
