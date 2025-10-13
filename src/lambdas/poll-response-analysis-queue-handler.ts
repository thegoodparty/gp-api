import { Context, SQSEvent } from 'aws-lambda'
import z from 'zod'
import { Logger } from '@aws-lambda-powertools/logger'
import {
  PollResponseInsight,
  uploadPollResultData,
} from 'src/polls/dynamo-helpers'

const Event = z.discriminatedUnion('type', [
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
])

const logger = new Logger({
  serviceName: 'poll-response-analysis-queue-handler',
})

export const handler = async (event: SQSEvent, context: Context) => {
  logger.addContext(context)

  logger.info('Processing events', { count: event.Records.length })

  for (const record of event.Records) {
    const parseResult = Event.safeParse(JSON.parse(record.body))

    if (!parseResult.success) {
      logger.error('Invalid message', { error: parseResult.error })
      throw new Error('invalid message')
    }

    const event = parseResult.data
    logger.info('Processing message', { event })

    switch (event.type) {
      case 'poll-response-analysis':
        await uploadPollResultData(event.data)
        break
      case 'poll-analysis-complete':
        // todo: handle poll complete
        break
    }
  }
}
