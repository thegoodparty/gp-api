import { describe, expect, it, vi } from 'vitest'
import { ExperimentRunStatus } from '../../generated/prisma'
import { useTestService } from '@/test-service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { AnnotationsService } from '../services/annotations.service'

const service = useTestService()

const ANNOTATION_LIMIT = 200

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
) => {
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

const anchoredNote = {
  kind: 'note' as const,
  anchor: {
    json_path: '/items/0/display/summary',
    start: 0,
    end: 10,
  },
  payload: { body: 'A useful annotation.' },
}

const topLevelNote = {
  kind: 'note' as const,
  anchor: { json_path: null, start: null, end: null },
  payload: { body: 'Top-level note.' },
}

const cardLevelNote = {
  kind: 'note' as const,
  // Card-level: json_path identifies the whole card; start/end are null.
  anchor: { json_path: '/items/0', start: null, end: null },
  payload: { body: 'A note about the whole card.' },
}

const bugReport = {
  kind: 'bug_report' as const,
  anchor: {
    json_path: '/items/1/title',
    start: 5,
    end: 15,
  },
  payload: { description: 'This figure looks wrong.' },
}

const reviewComment = {
  kind: 'review' as const,
  anchor: {
    json_path: '/items/0/display/summary',
    start: 0,
    end: 10,
  },
  payload: { body: 'Reviewer note: fix this.' },
}

describe('POST /v1/meetings/:date/briefing/annotations', () => {
  it('creates a text-anchored note and returns the new annotation', async () => {
    const orgSlug = 'eo-create-note'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const result = await service.client.post(
      '/v1/meetings/2026-06-08/briefing/annotations',
      anchoredNote,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(201)
    expect(result.data).toMatchObject({
      kind: 'note',
      resource_type: 'briefing',
      author_user_id: service.user.id,
      json_path: '/items/0/display/summary',
      start: 0,
      end: 10,
      note: { body: 'A useful annotation.' },
    })
  })

  it('creates a top-level note when anchor is all null', async () => {
    const orgSlug = 'eo-toplevel'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const result = await service.client.post(
      '/v1/meetings/2026-06-08/briefing/annotations',
      topLevelNote,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(201)
    expect(result.data).toMatchObject({
      kind: 'note',
      json_path: null,
      start: null,
      end: null,
      note: { body: 'Top-level note.' },
    })
  })

  it('creates a card-level note when json_path is set but start/end are null', async () => {
    const orgSlug = 'eo-cardlevel'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const result = await service.client.post(
      '/v1/meetings/2026-06-08/briefing/annotations',
      cardLevelNote,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(201)
    expect(result.data).toMatchObject({
      kind: 'note',
      json_path: '/items/0',
      start: null,
      end: null,
      note: { body: 'A note about the whole card.' },
    })
  })

  it('creates a bug_report', async () => {
    const orgSlug = 'eo-bug'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const result = await service.client.post(
      '/v1/meetings/2026-06-08/briefing/annotations',
      bugReport,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(201)
    expect(result.data).toMatchObject({
      kind: 'bug_report',
      bug_report: { description: 'This figure looks wrong.' },
    })
  })

  it('rejects empty note body', async () => {
    const orgSlug = 'eo-empty'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const result = await service.client.post(
      '/v1/meetings/2026-06-08/briefing/annotations',
      { ...anchoredNote, payload: { body: '' } },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(400)
  })

  it('rejects an anchor with offsets but no json_path', async () => {
    // Card-level (json_path only) and briefing-wide (all null) are valid;
    // only the inverse shape — offsets with no json_path to apply them to
    // — is rejected.
    const orgSlug = 'eo-mixed-anchor'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const result = await service.client.post(
      '/v1/meetings/2026-06-08/briefing/annotations',
      {
        kind: 'note',
        anchor: { json_path: null, start: 0, end: 10 },
        payload: { body: 'orphan offsets' },
      },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(400)
  })

  it('returns 404 when no briefing exists for the date', async () => {
    const orgSlug = 'eo-no-briefing'
    await seedElectedOffice(orgSlug)

    const result = await service.client.post(
      '/v1/meetings/2026-06-08/briefing/annotations',
      anchoredNote,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(404)
  })

  it('rejects creation past the per-user-per-briefing limit', async () => {
    const orgSlug = 'eo-limit'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, '2026-06-08')

    await service.prisma.annotation.createMany({
      data: Array.from({ length: ANNOTATION_LIMIT }, (_, i) => ({
        authorUserId: service.user.id,
        kind: 'note' as const,
        resourceType: 'briefing' as const,
        resourceId: briefing.id,
        jsonPath: `/items/${i}/title`,
        start: 0,
        end: 1,
      })),
    })

    const result = await service.client.post(
      '/v1/meetings/2026-06-08/briefing/annotations',
      anchoredNote,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(403)
  })
})

describe('GET /v1/meetings/:date/briefing/annotations', () => {
  it('returns only the requesting user own annotations for the briefing', async () => {
    const orgSlug = 'eo-list-isolation'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const otherUser = await service.prisma.user.create({
      data: {
        clerkId: 'other_user',
        email: 'other@goodparty.org',
        firstName: 'Other',
        lastName: 'User',
      },
    })

    await service.prisma.annotation.create({
      data: {
        author: { connect: { id: service.user.id } },
        kind: 'note',
        resourceType: 'briefing',
        resourceId: briefing.id,
        note: { create: { body: 'mine' } },
      },
    })
    await service.prisma.annotation.create({
      data: {
        author: { connect: { id: otherUser.id } },
        kind: 'note',
        resourceType: 'briefing',
        resourceId: briefing.id,
        note: { create: { body: 'theirs' } },
      },
    })

    const result = await service.client.get(
      '/v1/meetings/2026-06-08/briefing/annotations',
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(200)
    expect(result.data.annotations).toHaveLength(1)
    expect(result.data.annotations[0].author_user_id).toBe(service.user.id)
    expect(result.data.annotations[0].note.body).toBe('mine')
  })

  it('returns empty list when no annotations exist', async () => {
    const orgSlug = 'eo-list-empty'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const result = await service.client.get(
      '/v1/meetings/2026-06-08/briefing/annotations',
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(200)
    expect(result.data.annotations).toEqual([])
  })

  it('returns 404 for a date that has no briefing', async () => {
    const orgSlug = 'eo-list-missing'
    await seedElectedOffice(orgSlug)

    const result = await service.client.get(
      '/v1/meetings/2026-06-08/briefing/annotations',
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(404)
  })
})

describe('PUT /v1/annotations/:annotationId/note', () => {
  it('updates the note body', async () => {
    const orgSlug = 'eo-update'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, '2026-06-08')
    const annotation = await service.prisma.annotation.create({
      data: {
        author: { connect: { id: service.user.id } },
        kind: 'note',
        resourceType: 'briefing',
        resourceId: briefing.id,
        note: { create: { body: 'old' } },
      },
    })

    const result = await service.client.put(
      `/v1/annotations/${annotation.id}/note`,
      { body: 'new body' },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(200)
    expect(result.data.note.body).toBe('new body')
  })

  it('rejects update of an annotation owned by another user', async () => {
    const orgSlug = 'eo-update-foreign'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const otherUser = await service.prisma.user.create({
      data: {
        clerkId: 'foreign_user',
        email: 'foreign@goodparty.org',
        firstName: 'Foreign',
        lastName: 'User',
      },
    })

    const annotation = await service.prisma.annotation.create({
      data: {
        author: { connect: { id: otherUser.id } },
        kind: 'note',
        resourceType: 'briefing',
        resourceId: briefing.id,
        note: { create: { body: 'theirs' } },
      },
    })

    const result = await service.client.put(
      `/v1/annotations/${annotation.id}/note`,
      { body: 'hijack' },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(403)
  })

  it('rejects updating an annotation tied to a different elected office', async () => {
    const ownOrg = 'eo-own'
    await seedElectedOffice(ownOrg)

    const otherUser = await service.prisma.user.create({
      data: {
        clerkId: 'other_office_user',
        email: 'oo@goodparty.org',
        firstName: 'OO',
        lastName: 'User',
      },
    })
    const otherEo = await seedElectedOffice('eo-other-office', otherUser.id)
    const otherBriefing = await seedBriefing(
      otherEo.id,
      'eo-other-office',
      '2026-06-08',
    )

    const annotation = await service.prisma.annotation.create({
      data: {
        author: { connect: { id: service.user.id } },
        kind: 'note',
        resourceType: 'briefing',
        resourceId: otherBriefing.id,
        note: { create: { body: 'note in other tenant' } },
      },
    })

    const result = await service.client.put(
      `/v1/annotations/${annotation.id}/note`,
      { body: 'still mine?' },
      orgHeader(ownOrg),
    )

    expect(result.status).toBe(403)
  })

  it('returns 404 for an unknown annotation id', async () => {
    const orgSlug = 'eo-update-404'
    await seedElectedOffice(orgSlug)

    const result = await service.client.put(
      '/v1/annotations/does-not-exist/note',
      { body: 'x' },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(404)
  })

  it('rejects empty body', async () => {
    const orgSlug = 'eo-update-empty'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, '2026-06-08')
    const annotation = await service.prisma.annotation.create({
      data: {
        author: { connect: { id: service.user.id } },
        kind: 'note',
        resourceType: 'briefing',
        resourceId: briefing.id,
        note: { create: { body: 'something' } },
      },
    })

    const result = await service.client.put(
      `/v1/annotations/${annotation.id}/note`,
      { body: '' },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(400)
  })
})

describe('DELETE /v1/annotations/:annotationId', () => {
  it('deletes the annotation and its note', async () => {
    const orgSlug = 'eo-delete'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, '2026-06-08')
    const annotation = await service.prisma.annotation.create({
      data: {
        author: { connect: { id: service.user.id } },
        kind: 'note',
        resourceType: 'briefing',
        resourceId: briefing.id,
        note: { create: { body: 'kill me' } },
      },
      include: { note: true },
    })

    const result = await service.client.delete(
      `/v1/annotations/${annotation.id}`,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(204)
    expect(
      await service.prisma.annotation.findUnique({
        where: { id: annotation.id },
      }),
    ).toBeNull()
    expect(
      await service.prisma.annotationNote.findUnique({
        where: { id: annotation.note!.id },
      }),
    ).toBeNull()
  })

  it('cleans up S3 attachments when deleting an annotation', async () => {
    const orgSlug = 'eo-delete-with-attachments'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, '2026-06-08')
    const annotation = await service.prisma.annotation.create({
      data: {
        author: { connect: { id: service.user.id } },
        kind: 'note',
        resourceType: 'briefing',
        resourceId: briefing.id,
        note: {
          create: {
            body: null,
            attachments: {
              create: [
                {
                  storageKey: 'annotations/x/y',
                  fileName: 'doc.pdf',
                  mimeType: 'application/pdf',
                  sizeBytes: 1024,
                },
              ],
            },
          },
        },
      },
      include: { note: { include: { attachments: true } } },
    })

    const s3 = service.app.get(S3Service)
    const deleteSpy = vi.spyOn(s3, 'deleteObject').mockResolvedValue(undefined)

    const result = await service.client.delete(
      `/v1/annotations/${annotation.id}`,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(204)
    expect(deleteSpy).toHaveBeenCalledWith(
      expect.any(String),
      'annotations/x/y',
    )
    expect(
      await service.prisma.annotationNoteAttachment.findFirst({
        where: { noteId: annotation.note!.id },
      }),
    ).toBeNull()
  })

  it('returns 404 for an unknown annotation id', async () => {
    const orgSlug = 'eo-delete-404'
    await seedElectedOffice(orgSlug)

    const result = await service.client.delete(
      '/v1/annotations/missing-id',
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(404)
  })

  it("rejects deleting another user's annotation", async () => {
    const orgSlug = 'eo-delete-foreign'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const otherUser = await service.prisma.user.create({
      data: {
        clerkId: 'delete_other',
        email: 'delete-other@goodparty.org',
        firstName: 'A',
        lastName: 'B',
      },
    })

    const annotation = await service.prisma.annotation.create({
      data: {
        author: { connect: { id: otherUser.id } },
        kind: 'note',
        resourceType: 'briefing',
        resourceId: briefing.id,
        note: { create: { body: 'theirs' } },
      },
    })

    const result = await service.client.delete(
      `/v1/annotations/${annotation.id}`,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(403)
  })
})

// The HTTP client authenticates as a normal user with no impersonation actor,
// so these exercise the default-deny boundary exactly as a real user would hit
// it. Review rows must never leak to or be mutated by a non-impersonated user.
describe('review annotations — default-deny over HTTP (no actor)', () => {
  it('rejects creating a review without an impersonation actor', async () => {
    const orgSlug = 'eo-review-noactor'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const result = await service.client.post(
      '/v1/meetings/2026-06-08/briefing/annotations',
      reviewComment,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(403)
  })

  it('rejects listing kinds=review without an impersonation actor', async () => {
    const orgSlug = 'eo-review-list-noactor'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const result = await service.client.get(
      '/v1/meetings/2026-06-08/briefing/annotations?kinds=review',
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(403)
  })

  it('omits review rows from a normal list', async () => {
    const orgSlug = 'eo-review-leak'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, '2026-06-08')

    await service.prisma.annotation.create({
      data: {
        author: { connect: { id: service.user.id } },
        kind: 'note',
        resourceType: 'briefing',
        resourceId: briefing.id,
        note: { create: { body: 'visible note' } },
      },
    })
    await service.prisma.annotation.create({
      data: {
        author: { connect: { id: service.user.id } },
        kind: 'review',
        resourceType: 'briefing',
        resourceId: briefing.id,
        annotationReview: {
          create: { body: 'secret review', reviewerClerkSub: 'user_admin' },
        },
      },
    })

    const result = await service.client.get(
      '/v1/meetings/2026-06-08/briefing/annotations',
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(200)
    expect(result.data.annotations).toHaveLength(1)
    expect(result.data.annotations[0].kind).toBe('note')
  })

  it('rejects deleting a review row without an impersonation actor', async () => {
    const orgSlug = 'eo-review-del-noactor'
    const eo = await seedElectedOffice(orgSlug)
    const briefing = await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const review = await service.prisma.annotation.create({
      data: {
        author: { connect: { id: service.user.id } },
        kind: 'review',
        resourceType: 'briefing',
        resourceId: briefing.id,
        annotationReview: {
          create: { body: 'x', reviewerClerkSub: 'user_admin' },
        },
      },
    })

    const result = await service.client.delete(
      `/v1/annotations/${review.id}`,
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(403)
  })
})

// The service takes actorSub/actorUser as explicit args (the guard populates
// them in production). Driving the real service against the real DB is the
// closest we can get to the impersonation path without minting an actor JWT.
describe('AnnotationsService — review behavior with an actor', () => {
  const ACTOR_SUB = 'user_admin_123'

  it('persists reviewer attribution and lists reviews back', async () => {
    const annotations = service.app.get(AnnotationsService)
    const orgSlug = 'eo-review-svc'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, '2026-06-08')

    const admin = await service.prisma.user.create({
      data: {
        clerkId: ACTOR_SUB,
        email: 'admin-reviewer@goodparty.org',
        firstName: 'Admin',
        lastName: 'Reviewer',
      },
    })

    const created = await annotations.createForBriefing(
      '2026-06-08',
      service.user.id,
      eo,
      reviewComment,
      ACTOR_SUB,
      admin,
    )

    expect(created.kind).toBe('review')
    expect(created.author_user_id).toBe(service.user.id)
    expect(created.review?.body).toBe('Reviewer note: fix this.')
    expect(created.review?.reviewer_email).toBe('admin-reviewer@goodparty.org')

    const dbReview = await service.prisma.annotationReview.findFirst({
      where: { id: created.review?.id },
    })
    expect(dbReview?.reviewerClerkSub).toBe(ACTOR_SUB)

    const listedWithActor = await annotations.listForBriefing(
      '2026-06-08',
      service.user.id,
      eo,
      ACTOR_SUB,
      ['review'],
    )
    expect(listedWithActor).toHaveLength(1)
    expect(listedWithActor[0].kind).toBe('review')

    const listedNormally = await annotations.listForBriefing(
      '2026-06-08',
      service.user.id,
      eo,
      null,
    )
    expect(listedNormally).toHaveLength(0)
  })
})
