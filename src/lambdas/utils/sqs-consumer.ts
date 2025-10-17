import { Logger } from '@aws-lambda-powertools/logger'
import { PrismaClient } from '@prisma/client'
import { Context, SQSEvent, SQSRecord } from 'aws-lambda'
import z from 'zod'

export type SQSConsumerConfig<Event> = {
  name: string
  schema: z.ZodSchema<Event>
  reportBatchFailures: boolean
}

export type SQSConsumerContext = {
  prisma: PrismaClient
  logger: Logger
}

export const createSQSConsumer = <Event>(
  config: SQSConsumerConfig<Event>,
  handler: (ctx: SQSConsumerContext, event: Event) => Promise<void>,
) => {
  const logger = new Logger({ serviceName: config.name })

  let prisma: PrismaClient

  return async (event: SQSEvent, context: Context) => {
    logger.addContext(context)
    logger.info('Processing SQS event', { event })

    if (!prisma) {
      try {
        const _prisma = new PrismaClient()
        await _prisma.$connect()
        prisma = _prisma
      } catch (error) {
        logger.error('Failed to connect prisma client', { error })
        throw error
      }
    }

    const failedRecords: SQSRecord[] = []

    for (const record of event.Records) {
      const parseResult = config.schema.safeParse(JSON.parse(record.body))

      if (!parseResult.success) {
        logger.error('Invalid message', { record, error: parseResult.error })
        throw new Error('Invalid message')
      }

      const event = parseResult.data
      logger.info('Processing message', { record, event })

      try {
        await handler(
          {
            prisma,
            logger: logger.createChild({
              persistentKeys: { messageId: record.messageId },
            }),
          },
          event,
        )

        logger.info('Successfully processed message', {
          messageId: record.messageId,
          record,
        })
      } catch (error) {
        failedRecords.push(record)
        logger.error('Error processing message', {
          messageId: record.messageId,
          record,
          error,
        })
      }
    }

    if (!config.reportBatchFailures || failedRecords.length === 0) {
      return
    }

    return {
      batchItemFailures: failedRecords.map((record) => ({
        itemIdentifier: record.messageId,
      })),
    }
  }
}
