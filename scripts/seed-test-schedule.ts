/**
 * Seed a fake completed meeting_schedule run for local UI testing.
 *
 * Finds the most recent RUNNING `meeting_schedule` ExperimentRun for the given
 * org slug, synthesizes a MeetingScheduleFound artifact JSON, uploads it to
 * MEETING_PIPELINE_BUCKET, and marks the run COMPLETED. After this runs,
 * GET /v1/meetings projects upcoming dates from the RRULE so the briefings
 * page renders awaiting-agenda rows.
 *
 * Usage:
 *   npx tsx scripts/seed-test-schedule.ts <orgSlug> [bucket]
 *
 * Example:
 *   npx tsx scripts/seed-test-schedule.ts eo-019e9892-b59c-755d-a7fa-4496e2e3d5f4
 */

import 'dotenv/config'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { PrismaClient } from '@prisma/client'

const orgSlug = process.argv[2]
if (!orgSlug) {
  console.error('Usage: npx tsx scripts/seed-test-schedule.ts <orgSlug> [bucket]')
  process.exit(1)
}
const bucket = process.argv[3] ?? process.env.MEETING_PIPELINE_BUCKET
if (!bucket) {
  console.error(
    'Pass a bucket as the 2nd arg or set MEETING_PIPELINE_BUCKET in .env',
  )
  process.exit(1)
}

const prisma = new PrismaClient()
const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-west-2' })

const synthArtifact = {
  status: 'found' as const,
  rrule: 'FREQ=WEEKLY;BYDAY=MO',
  time: '19:00',
  timezone: 'America/New_York',
  duration_minutes: 120,
  meeting_name: 'Test City Council',
  location: 'Test City Hall Council Chambers, 200 Main St',
  human: 'Every Monday at 7 PM',
  sources: [
    {
      url: 'https://example.gov/meetings',
      note: 'Seeded for local UI testing',
    },
  ],
  generated_at: new Date().toISOString(),
  discovered_schedule_location: 'https://example.gov/meetings/',
}

const main = async () => {
  const run = await prisma.experimentRun.findFirst({
    where: {
      organizationSlug: orgSlug,
      experimentType: 'meeting_schedule',
      status: 'RUNNING',
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!run) {
    console.error(
      `No RUNNING meeting_schedule run found for org ${orgSlug}. ` +
        `Dispatch one first (devtool button or POST /v1/meetings/briefings/dispatch).`,
    )
    process.exit(1)
  }

  const artifactKey = `schedules/seeded-${run.runId}.json`
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: artifactKey,
      Body: JSON.stringify(synthArtifact, null, 2),
      ContentType: 'application/json',
    }),
  )
  console.log(`Uploaded artifact to s3://${bucket}/${artifactKey}`)

  await prisma.experimentRun.update({
    where: { runId: run.runId },
    data: {
      status: 'COMPLETED',
      artifactBucket: bucket,
      artifactKey,
    },
  })
  console.log(`Marked run ${run.runId} as COMPLETED`)

  console.log('\nDone. Reload /dashboard/briefings — you should see upcoming')
  console.log('Mondays as awaiting-agenda rows.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
