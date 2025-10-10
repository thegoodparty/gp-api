import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocument, QueryCommandInput } from '@aws-sdk/lib-dynamodb'
import { Logger } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import z from 'zod'
import { PollIssue } from './polls.types'
import { uniq } from 'lodash'

const dynamo = DynamoDBDocument.from(new DynamoDBClient({}))

const tableName = () => {
  if (!process.env.POLL_INSIGHTS_DYNAMO_TABLE_NAME) {
    throw new Error('POLL_INSIGHTS_DYNAMO_TABLE_NAME is not set')
  }
  return process.env.POLL_INSIGHTS_DYNAMO_TABLE_NAME
}

export const PollResponseInsight = z.object({
  poll_id: z.string(),
  record_id: z.string().uuid().optional(),
  message: z.string(),
  atomic_message: z.string(),
  phone_number: z.string(),
  created_at: z.string().datetime().optional(),

  summary: z.string(),
  analysis: z.string(),
  theme: z.string(),
  category: z.string(),
  sentiment: z.string(),
  quotes: z.array(z.object({ quote: z.string(), phone_number: z.string() })),

  age: z.number(),
  business_owner: z.string(),
  education_level: z.string(),
  families_with_children: z.string(),
  homeowner: z.string(),
  income: z.string(),
  location: z.string(),
})

type PersistedPollInsight = z.infer<typeof PollResponseInsight> & {
  record_id: string
  created_at: string
  updated_at: string
}

export const uploadPollResultData = async (
  data: z.infer<typeof PollResponseInsight>,
) => {
  const now = new Date().toISOString()
  const item: PersistedPollInsight = {
    ...data,
    record_id: data.record_id || uuidv4(),
    created_at: data.created_at || now,
    updated_at: now,
  }
  await dynamo.put({ TableName: tableName(), Item: item })
  return item
}

const exhaustiveQuery = async <T>(input: QueryCommandInput): Promise<T[]> => {
  let lastEvaluatedKey: Record<string, unknown> | undefined
  const items: Record<string, unknown>[] = []
  do {
    const tmp = await dynamo.query({
      ...input,
      ExclusiveStartKey: lastEvaluatedKey,
    })
    items.push(...(tmp.Items ?? []))
    lastEvaluatedKey = tmp.LastEvaluatedKey
  } while (!!lastEvaluatedKey)

  return items as T[]
}

export const queryTopIssues = async (
  logger: Logger,
  pollId: string,
): Promise<PollIssue[]> => {
  const allRecords: PersistedPollInsight[] = await exhaustiveQuery({
    TableName: tableName(),
    KeyConditionExpression: 'poll_id = :pid',
    ExpressionAttributeValues: { ':pid': pollId },
  })

  logger.log(`Found ${allRecords.length} records for poll ${pollId}`)

  // TODO: filter the records above in-memory when demographic filtering is needed.

  return uniq(allRecords.map((record) => record.theme))
    .map((theme) => ({
      theme,
      records: allRecords.filter((record) => record.theme === theme),
    }))
    .map(({ theme, records }) => ({
      title: theme,
      pollId,
      summary: records[0].summary,
      details: records[0].analysis,
      mentionCount: records.length,
      representativeComments: records[0].quotes.map((quote) => ({
        comment: quote.quote,
        // TODO ENG-4472: support name lookup from phone number.
        name: quote.phone_number,
      })),
    }))
}
