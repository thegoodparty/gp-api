import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { SQS } from '@aws-sdk/client-sqs'
import { v7 as uuidv7 } from 'uuid'
import { randomUUID } from 'crypto'

async function main() {
  const organizationSlug = process.argv[2] ?? 'eo-019db7a7-159e-7882-9d96-21f847f2a60d'
  const experimentType = process.argv[3] ?? 'district_intel'

  const queueName = process.env.AGENT_DISPATCH_QUEUE_NAME
  if (!queueName) throw new Error('AGENT_DISPATCH_QUEUE_NAME not set')

  const sqs = new SQS({})
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName: queueName })
  if (!QueueUrl) throw new Error(`Queue not found: ${queueName}`)

  const prisma = new PrismaClient()

  const params = {
    state: 'NC',
    city: 'Hendersonville',
    l2DistrictType: 'City',
    l2DistrictName: 'Hendersonville',
  }

  const runId = uuidv7()

  const run = await prisma.experimentRun.create({
    data: {
      runId,
      organizationSlug,
      experimentType,
      params,
      status: 'RUNNING',
    },
  })

  const body = JSON.stringify({
    run_id: runId,
    params,
    organization_slug: organizationSlug,
    experiment_type: experimentType,
  })

  const sqsResp = await sqs.sendMessage({
    QueueUrl,
    MessageBody: body,
    MessageGroupId: `agent-dispatch-${organizationSlug}`,
    MessageDeduplicationId: randomUUID(),
  })

  console.log(JSON.stringify({ run, sqsMessageId: sqsResp.MessageId, queueUrl: QueueUrl }, null, 2))
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
