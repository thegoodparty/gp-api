import { describe, expect, it } from 'vitest'
import { ExperimentRunStatus, MeetingBriefing } from '@prisma/client'
import { useTestService } from '@/test-service'

const service = useTestService()

const seedElectedOffice = async (orgSlug: string, userId?: number) => {
  await service.prisma.organization.create({
    data: { slug: orgSlug, ownerId: userId ?? service.user.id },
  })
  return service.prisma.electedOffice.create({
    data: {
      organizationSlug: orgSlug,
      userId: userId ?? service.user.id,
    },
  })
}

const seedBriefing = async (
  eoId: string,
  orgSlug: string,
  meetingDate: string,
): Promise<MeetingBriefing> => {
  const briefingRun = await service.prisma.experimentRun.create({
    data: {
      organizationSlug: orgSlug,
      experimentType: 'meeting_briefing',
      status: ExperimentRunStatus.COMPLETED,
    },
  })
  return service.prisma.meetingBriefing.create({
    data: {
      electedOfficeId: eoId,
      meetingDate: new Date(meetingDate + 'T00:00:00Z'),
      meetingTime: '19:00',
      meetingTimezone: 'America/Denver',
      experimentRunId: briefingRun.runId,
      artifactBucket: 'briefing-bucket',
      artifactKey: `${meetingDate}.json`,
    },
  })
}

const orgHeader = (slug: string) => ({
  headers: { 'x-organization-slug': slug },
})

const ITEM_ID = 'item_alpha_uuid'
const OTHER_ITEM_ID = 'item_beta_uuid'
const DATE = '2026-06-08'
const OTHER_DATE = '2026-06-15'
const NO_BRIEFING_FOR_DATE_TEST =
  'returns 404 when no briefing exists for the date'

describe('PUT /v1/meetings/:date/briefing/items/:itemId/feedback', () => {
  it('creates the feedback row when none exists', async () => {
    const orgSlug = 'eo-fb-create'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, DATE)

    const result = await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'positive' },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(200)
    expect(result.data).toMatchObject({
      organization_slug: orgSlug,
      submitter_user_id: service.user.id,
      artifact_type: 'agenda_item',
      artifact_id: ITEM_ID,
      feedback: 'positive',
    })

    const rows = await service.prisma.artifactFeedback.findMany({
      where: { briefingId: briefing.id, submitterUserId: service.user.id },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].artifactId).toBe(ITEM_ID)
  })

  it('switching positive -> negative updates the same row in place', async () => {
    const orgSlug = 'eo-fb-switch'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, DATE)

    const first = await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'positive' },
      orgHeader(orgSlug),
    )
    const second = await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'negative' },
      orgHeader(orgSlug),
    )

    expect(second.status).toBe(200)
    expect(second.data.id).toBe(first.data.id)
    expect(second.data.feedback).toBe('negative')

    const rows = await service.prisma.artifactFeedback.findMany({
      where: { briefingId: briefing.id, submitterUserId: service.user.id },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].feedback).toBe('negative')
  })

  it('repeating the same vote is idempotent (single row)', async () => {
    const orgSlug = 'eo-fb-idempotent'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, DATE)

    await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'positive' },
      orgHeader(orgSlug),
    )
    await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'positive' },
      orgHeader(orgSlug),
    )

    const rows = await service.prisma.artifactFeedback.findMany({
      where: { briefingId: briefing.id, submitterUserId: service.user.id },
    })
    expect(rows).toHaveLength(1)
  })

  it('the same item id in two different briefings produces two independent rows', async () => {
    const orgSlug = 'eo-fb-cross-briefing'
    const eo = await seedElectedOffice(orgSlug)
    const briefingOne = await seedBriefing(eo.id, orgSlug, DATE)
    const briefingTwo = await seedBriefing(eo.id, orgSlug, OTHER_DATE)

    await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'positive' },
      orgHeader(orgSlug),
    )
    await service.client.put(
      `/v1/meetings/${OTHER_DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'negative' },
      orgHeader(orgSlug),
    )

    const rowsOne = await service.prisma.artifactFeedback.findMany({
      where: { briefingId: briefingOne.id, submitterUserId: service.user.id },
    })
    const rowsTwo = await service.prisma.artifactFeedback.findMany({
      where: { briefingId: briefingTwo.id, submitterUserId: service.user.id },
    })
    expect(rowsOne).toHaveLength(1)
    expect(rowsOne[0].feedback).toBe('positive')
    expect(rowsTwo).toHaveLength(1)
    expect(rowsTwo[0].feedback).toBe('negative')
  })

  it('rejects an invalid feedback value', async () => {
    const orgSlug = 'eo-fb-bad-value'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, DATE)

    const result = await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'maybe' },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(400)
  })

  it(NO_BRIEFING_FOR_DATE_TEST, async () => {
    const orgSlug = 'eo-fb-no-briefing'
    await seedElectedOffice(orgSlug)

    const result = await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'positive' },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(404)
  })

  it('returns 404 when the org slug does not match the user', async () => {
    const orgSlug = 'eo-fb-foreign-org'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, DATE)

    const result = await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'positive' },
      orgHeader('not-my-org'),
    )

    expect(result.status).toBe(404)
  })

  it('two users can vote on the same item without colliding', async () => {
    const orgSlug = 'eo-fb-two-users'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, DATE)

    const otherUser = await service.prisma.user.create({
      data: {
        clerkId: 'fb_other_user',
        email: 'fb-other@goodparty.org',
        firstName: 'Other',
        lastName: 'User',
      },
    })

    await service.prisma.artifactFeedback.create({
      data: {
        organizationSlug: orgSlug,
        briefingId: briefing.id,
        submitterUserId: otherUser.id,
        artifactId: ITEM_ID,
        artifactType: 'agenda_item',
        feedback: 'negative',
      },
    })

    const result = await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'positive' },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(200)
    const rows = await service.prisma.artifactFeedback.findMany({
      where: { briefingId: briefing.id, artifactId: ITEM_ID },
      orderBy: { submitterUserId: 'asc' },
    })
    expect(rows).toHaveLength(2)
    const mine = rows.find((r) => r.submitterUserId === service.user.id)
    const theirs = rows.find((r) => r.submitterUserId === otherUser.id)
    expect(mine?.feedback).toBe('positive')
    expect(theirs?.feedback).toBe('negative')
  })
})

describe('PUT comment handling', () => {
  const SAMPLE_COMMENT = 'the summary missed the rezoning vote'

  it('persists a comment supplied on first PUT and echoes it on the response', async () => {
    const orgSlug = 'eo-fb-comment-create'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, DATE)

    const result = await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'negative', comment: SAMPLE_COMMENT },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(200)
    expect(result.data.comment).toBe(SAMPLE_COMMENT)

    const row = await service.prisma.artifactFeedback.findFirst({
      where: { briefingId: briefing.id, submitterUserId: service.user.id },
    })
    expect(row?.comment).toBe(SAMPLE_COMMENT)
  })

  it('omitting `comment` on a follow-up PUT preserves the previously-stored comment', async () => {
    const orgSlug = 'eo-fb-comment-preserve'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, DATE)

    await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'negative', comment: 'first take' },
      orgHeader(orgSlug),
    )
    // Re-vote with no `comment` key — the upsert `update` branch must
    // skip the column so we don't accidentally null out the existing text.
    const result = await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'negative' },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(200)
    expect(result.data.comment).toBe('first take')
  })

  it('passing `comment: null` clears a previously-set comment', async () => {
    const orgSlug = 'eo-fb-comment-clear'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, DATE)

    await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'negative', comment: 'original take' },
      orgHeader(orgSlug),
    )
    const result = await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'negative', comment: null },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(200)
    expect(result.data.comment).toBeNull()
  })

  it('rejects a comment longer than 2000 characters with 400', async () => {
    const orgSlug = 'eo-fb-comment-too-long'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, DATE)

    const tooLong = 'x'.repeat(2001)
    const result = await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'negative', comment: tooLong },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(400)
  })

  it('echoes `comment: null` for rows that have never had a comment set', async () => {
    const orgSlug = 'eo-fb-comment-default-null'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, DATE)

    const result = await service.client.put(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      { feedback: 'positive' },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(200)
    expect(result.data.comment).toBeNull()
  })
})

describe('DELETE /v1/meetings/:date/briefing/items/:itemId/feedback', () => {
  it('deletes the row and returns 204', async () => {
    const orgSlug = 'eo-fb-delete'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, DATE)

    await service.prisma.artifactFeedback.create({
      data: {
        organizationSlug: orgSlug,
        briefingId: briefing.id,
        submitterUserId: service.user.id,
        artifactId: ITEM_ID,
        artifactType: 'agenda_item',
        feedback: 'positive',
      },
    })

    const result = await service.client.delete(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(204)
    const remaining = await service.prisma.artifactFeedback.findMany({
      where: { briefingId: briefing.id, submitterUserId: service.user.id },
    })
    expect(remaining).toHaveLength(0)
  })

  it('is idempotent when no row exists (still 204)', async () => {
    const orgSlug = 'eo-fb-delete-noop'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, DATE)

    const result = await service.client.delete(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(204)
  })

  it('does not touch another user feedback for the same item', async () => {
    const orgSlug = 'eo-fb-delete-isolation'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, DATE)

    const otherUser = await service.prisma.user.create({
      data: {
        clerkId: 'fb_delete_other',
        email: 'fb-delete-other@goodparty.org',
        firstName: 'Other',
        lastName: 'User',
      },
    })

    await service.prisma.artifactFeedback.create({
      data: {
        organizationSlug: orgSlug,
        briefingId: briefing.id,
        submitterUserId: otherUser.id,
        artifactId: ITEM_ID,
        artifactType: 'agenda_item',
        feedback: 'positive',
      },
    })

    await service.client.delete(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      orgHeader(orgSlug),
    )

    const remaining = await service.prisma.artifactFeedback.findMany({
      where: { briefingId: briefing.id, artifactId: ITEM_ID },
    })
    expect(remaining).toHaveLength(1)
    expect(remaining[0].submitterUserId).toBe(otherUser.id)
  })

  it('does not touch the same user feedback in a different briefing', async () => {
    const orgSlug = 'eo-fb-delete-cross-briefing'
    const eo = await seedElectedOffice(orgSlug)
    const briefingOne = await seedBriefing(eo.id, orgSlug, DATE)
    const briefingTwo = await seedBriefing(eo.id, orgSlug, OTHER_DATE)

    await service.prisma.artifactFeedback.createMany({
      data: [
        {
          organizationSlug: orgSlug,
          briefingId: briefingOne.id,
          submitterUserId: service.user.id,
          artifactId: ITEM_ID,
          artifactType: 'agenda_item',
          feedback: 'positive',
        },
        {
          organizationSlug: orgSlug,
          briefingId: briefingTwo.id,
          submitterUserId: service.user.id,
          artifactId: ITEM_ID,
          artifactType: 'agenda_item',
          feedback: 'positive',
        },
      ],
    })

    await service.client.delete(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      orgHeader(orgSlug),
    )

    const remainingOne = await service.prisma.artifactFeedback.findMany({
      where: { briefingId: briefingOne.id },
    })
    const remainingTwo = await service.prisma.artifactFeedback.findMany({
      where: { briefingId: briefingTwo.id },
    })
    expect(remainingOne).toHaveLength(0)
    expect(remainingTwo).toHaveLength(1)
  })

  it(NO_BRIEFING_FOR_DATE_TEST, async () => {
    const orgSlug = 'eo-fb-delete-404'
    await seedElectedOffice(orgSlug)

    const result = await service.client.delete(
      `/v1/meetings/${DATE}/briefing/items/${ITEM_ID}/feedback`,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(404)
  })
})

describe('GET /v1/meetings/:date/briefing/feedback', () => {
  it('returns only the requesting user own feedback rows for that briefing', async () => {
    const orgSlug = 'eo-fb-list-isolation'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, DATE)
    const otherBriefing = await seedBriefing(eo.id, orgSlug, OTHER_DATE)

    const otherUser = await service.prisma.user.create({
      data: {
        clerkId: 'fb_list_other',
        email: 'fb-list-other@goodparty.org',
        firstName: 'Other',
        lastName: 'User',
      },
    })

    await service.prisma.artifactFeedback.createMany({
      data: [
        {
          organizationSlug: orgSlug,
          briefingId: briefing.id,
          submitterUserId: service.user.id,
          artifactId: ITEM_ID,
          artifactType: 'agenda_item',
          feedback: 'positive',
        },
        {
          organizationSlug: orgSlug,
          briefingId: briefing.id,
          submitterUserId: service.user.id,
          artifactId: OTHER_ITEM_ID,
          artifactType: 'agenda_item',
          feedback: 'negative',
        },
        {
          organizationSlug: orgSlug,
          briefingId: briefing.id,
          submitterUserId: otherUser.id,
          artifactId: ITEM_ID,
          artifactType: 'agenda_item',
          feedback: 'negative',
        },
        {
          organizationSlug: orgSlug,
          briefingId: otherBriefing.id,
          submitterUserId: service.user.id,
          artifactId: ITEM_ID,
          artifactType: 'agenda_item',
          feedback: 'negative',
        },
      ],
    })

    const result = await service.client.get(
      `/v1/meetings/${DATE}/briefing/feedback`,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(200)
    expect(result.data.feedback).toHaveLength(2)
    const byItem = Object.fromEntries(
      result.data.feedback.map(
        (f: { artifact_id: string; feedback: string }) => [
          f.artifact_id,
          f.feedback,
        ],
      ),
    )
    expect(byItem[ITEM_ID]).toBe('positive')
    expect(byItem[OTHER_ITEM_ID]).toBe('negative')
    // Every row in the listing should carry a `comment` field (null when
    // unset) so the client can rehydrate the composer without a second call.
    for (const row of result.data.feedback) {
      expect(row).toHaveProperty('comment')
    }
  })

  it('echoes a stored comment in the GET listing', async () => {
    const orgSlug = 'eo-fb-list-comment'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, DATE)

    await service.prisma.artifactFeedback.create({
      data: {
        organizationSlug: orgSlug,
        briefingId: briefing.id,
        submitterUserId: service.user.id,
        artifactId: ITEM_ID,
        artifactType: 'agenda_item',
        feedback: 'negative',
        comment: 'agenda card 3 missed the rezoning detail',
      },
    })

    const result = await service.client.get(
      `/v1/meetings/${DATE}/briefing/feedback`,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(200)
    expect(result.data.feedback).toHaveLength(1)
    expect(result.data.feedback[0].comment).toBe(
      'agenda card 3 missed the rezoning detail',
    )
  })

  it('returns empty list when the user has no feedback', async () => {
    const orgSlug = 'eo-fb-list-empty'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, DATE)

    const result = await service.client.get(
      `/v1/meetings/${DATE}/briefing/feedback`,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(200)
    expect(result.data.feedback).toEqual([])
  })

  it(NO_BRIEFING_FOR_DATE_TEST, async () => {
    const orgSlug = 'eo-fb-list-no-briefing'
    await seedElectedOffice(orgSlug)

    const result = await service.client.get(
      `/v1/meetings/${DATE}/briefing/feedback`,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(404)
  })
})
