/**
 * Seed dev briefings data for serve@fightclub.org's elected office.
 *
 * Produces:
 *   1. A meeting_schedule ExperimentRun + S3 artifact (idempotent, one per org).
 *   2. Adds meeting_name + location to the latest seeded meeting_briefing
 *      artifact in S3.
 *   3. If gp-api PR #1599 has shipped (meeting_briefing.artifact column
 *      exists), updates that column too. Otherwise logs a warning and skips.
 *
 * Targets dev only. Configure with:
 *   AWS_PROFILE=work
 *   DATABASE_URL=<dev gp-api Postgres URL>
 *   AWS_REGION=us-west-2 (optional; defaults below)
 *
 * Usage:
 *   AWS_PROFILE=work npx tsx scripts/seed-dev-briefings.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  NoSuchKey,
} from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

const SERVE_EMAIL = 'serve@fightclub.org'
const ARTIFACT_BUCKET = 'gp-agent-artifacts-dev'
const AWS_REGION = process.env.AWS_REGION ?? 'us-west-2'
const SCHEDULE_EXPERIMENT_TYPE = 'meeting_schedule'

const MEETING_NAME = 'City Council'
const LOCATION =
  "Cheyenne City Hall Council Chambers, 2101 O'Neil Ave, Cheyenne, WY 82001"

type MeetingScheduleFoundArtifact = {
  generated_at: string
  status: 'found'
  meeting_name: string
  location: string
  rrule: string
  human: string
  time: string
  timezone: string
  duration_minutes: number
  sources: { url: string; note: string }[]
}

const buildScheduleArtifact = (): MeetingScheduleFoundArtifact => ({
  generated_at: new Date().toISOString(),
  status: 'found',
  meeting_name: MEETING_NAME,
  location: LOCATION,
  rrule: 'FREQ=WEEKLY;BYDAY=MO',
  human: 'Every Monday',
  time: '18:00',
  timezone: 'America/Denver',
  duration_minutes: 90,
  sources: [
    {
      url: 'https://www.cheyennecity.org/Your-Government/Elected-Officials/City-Council',
      note: 'Cheyenne City Council schedule page',
    },
  ],
})

const getJson = async <T>(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<T | null> => {
  try {
    const resp = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    )
    if (!resp.Body) return null
    const raw = await resp.Body.transformToString()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return JSON.parse(raw) as T
  } catch (err) {
    if (err instanceof NoSuchKey) return null
    throw err
  }
}

const putJson = async (
  s3: S3Client,
  bucket: string,
  key: string,
  body: unknown,
): Promise<void> => {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(body, null, 2),
      ContentType: 'application/json',
    }),
  )
}

const checkArtifactColumnExists = async (
  prisma: PrismaClient,
): Promise<boolean> => {
  const rows = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'meeting_briefing' AND column_name = 'artifact'
  `
  return rows.length > 0
}

const findElectedOfficeForServeUser = async (prisma: PrismaClient) => {
  const user = await prisma.user.findFirst({
    where: { email: SERVE_EMAIL },
    select: { id: true, email: true },
  })
  if (!user) {
    throw new Error(
      `User ${SERVE_EMAIL} not found in DB. Check DATABASE_URL points at dev.`,
    )
  }

  const office = await prisma.electedOffice.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  if (!office) {
    throw new Error(
      `No ElectedOffice found for user ${SERVE_EMAIL} (id ${user.id}).`,
    )
  }
  return { user, office }
}

const ensureScheduleRun = async (
  prisma: PrismaClient,
  s3: S3Client,
  organizationSlug: string,
) => {
  const existing = await prisma.experimentRun.findFirst({
    where: {
      organizationSlug,
      experimentType: SCHEDULE_EXPERIMENT_TYPE,
      status: 'COMPLETED',
      artifactBucket: { not: null },
      artifactKey: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (existing && existing.artifactBucket && existing.artifactKey) {
    const current = await getJson<MeetingScheduleFoundArtifact>(
      s3,
      existing.artifactBucket,
      existing.artifactKey,
    )
    const needsRewrite =
      !current ||
      current.status !== 'found' ||
      current.meeting_name !== MEETING_NAME ||
      current.location !== LOCATION

    if (needsRewrite) {
      await putJson(
        s3,
        existing.artifactBucket,
        existing.artifactKey,
        buildScheduleArtifact(),
      )
      console.log(
        `Rewrote existing schedule artifact at s3://${existing.artifactBucket}/${existing.artifactKey}`,
      )
    } else {
      console.log(
        `Schedule artifact already up to date at s3://${existing.artifactBucket}/${existing.artifactKey}`,
      )
    }

    return {
      runId: existing.runId,
      bucket: existing.artifactBucket,
      key: existing.artifactKey,
      created: false,
    }
  }

  const artifactKey = `${SCHEDULE_EXPERIMENT_TYPE}/${randomUUID()}/artifact.json`
  await putJson(s3, ARTIFACT_BUCKET, artifactKey, buildScheduleArtifact())

  const params = {
    state: 'WY',
    city: 'Cheyenne',
    office: MEETING_NAME,
  }

  const created = await prisma.experimentRun.create({
    data: {
      organizationSlug,
      experimentType: SCHEDULE_EXPERIMENT_TYPE,
      status: 'COMPLETED',
      params,
      artifactBucket: ARTIFACT_BUCKET,
      artifactKey,
    },
  })

  console.log(
    `Created schedule ExperimentRun ${created.runId} → s3://${ARTIFACT_BUCKET}/${artifactKey}`,
  )

  return {
    runId: created.runId,
    bucket: ARTIFACT_BUCKET,
    key: artifactKey,
    created: true,
  }
}

const patchBriefingArtifact = async (
  prisma: PrismaClient,
  s3: S3Client,
  electedOfficeId: string,
  hasArtifactColumn: boolean,
) => {
  const briefing = await prisma.meetingBriefing.findFirst({
    where: { electedOfficeId },
    orderBy: { meetingDate: 'desc' },
  })
  if (!briefing) {
    console.log(
      `No MeetingBriefing row found for elected office ${electedOfficeId}. Skipping briefing patch.`,
    )
    return null
  }

  const current = await getJson<Record<string, unknown>>(
    s3,
    briefing.artifactBucket,
    briefing.artifactKey,
  )
  if (!current) {
    console.log(
      `Briefing artifact missing at s3://${briefing.artifactBucket}/${briefing.artifactKey}. Skipping.`,
    )
    return null
  }

  const updated = {
    ...current,
    meeting_name: MEETING_NAME,
    location: LOCATION,
  }

  await putJson(s3, briefing.artifactBucket, briefing.artifactKey, updated)
  console.log(
    `Updated briefing artifact at s3://${briefing.artifactBucket}/${briefing.artifactKey} (added meeting_name + location)`,
  )

  if (hasArtifactColumn) {
    await prisma.$executeRaw`
      UPDATE meeting_briefing
      SET artifact = ${JSON.stringify(updated)}::jsonb,
          updated_at = NOW()
      WHERE id = ${briefing.id}
    `
    console.log(
      `Updated meeting_briefing.artifact column for briefing ${briefing.id}`,
    )
  } else {
    console.warn(
      `meeting_briefing.artifact column does not exist in this DB; ` +
        `skipping column update (PR #1599 not yet deployed).`,
    )
  }

  return {
    briefingId: briefing.id,
    bucket: briefing.artifactBucket,
    key: briefing.artifactKey,
  }
}

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Point it at the gp-api dev Postgres.',
    )
  }

  const prisma = new PrismaClient()
  const s3 = new S3Client({ region: AWS_REGION })

  try {
    const hasArtifactColumn = await checkArtifactColumnExists(prisma)
    console.log(
      `meeting_briefing.artifact column present: ${hasArtifactColumn}`,
    )

    const { user, office } = await findElectedOfficeForServeUser(prisma)
    console.log(
      `Found elected office ${office.id} (org ${office.organizationSlug}) for user ${user.email}`,
    )

    const schedule = await ensureScheduleRun(
      prisma,
      s3,
      office.organizationSlug,
    )

    const patched = await patchBriefingArtifact(
      prisma,
      s3,
      office.id,
      hasArtifactColumn,
    )

    console.log('\n— Summary —')
    console.log(
      JSON.stringify(
        {
          electedOfficeId: office.id,
          organizationSlug: office.organizationSlug,
          schedule,
          briefing: patched,
          hasArtifactColumn,
        },
        null,
        2,
      ),
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
