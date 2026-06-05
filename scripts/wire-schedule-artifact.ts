/**
 * Hand-wires a local experiment_run row to a real S3 schedule artifact
 * when the agent ran successfully in dev but the result message never
 * landed in the local DB.
 *
 * Usage:
 *   npx tsx scripts/wire-schedule-artifact.ts <runId> <bucket> <key> [--peek]
 */

import 'dotenv/config'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { PrismaClient } from '@prisma/client'

const [, , runId, bucket, key, ...rest] = process.argv
if (!runId || !bucket || !key) {
  console.error('Usage: npx tsx scripts/wire-schedule-artifact.ts <runId> <bucket> <key> [--peek]')
  process.exit(1)
}
const peek = rest.includes('--peek')

const prisma = new PrismaClient()
const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-west-2' })

const main = async () => {
  const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const body = await get.Body?.transformToString()
  if (!body) {
    console.error('Empty S3 object body')
    process.exit(1)
  }
  console.log(`artifact size: ${body.length} bytes`)
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch (err) {
    console.error('artifact is not JSON:', err)
    process.exit(1)
  }
  console.log('artifact preview:')
  console.log(JSON.stringify(parsed, null, 2))

  if (peek) {
    console.log('\n--peek mode: not updating DB. Drop --peek to wire it.')
    return
  }

  const updated = await prisma.experimentRun.update({
    where: { runId },
    data: {
      status: 'COMPLETED',
      artifactBucket: bucket,
      artifactKey: key,
    },
  })
  console.log(
    `\nWired run ${updated.runId} → status=COMPLETED, ${bucket}/${key}`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
