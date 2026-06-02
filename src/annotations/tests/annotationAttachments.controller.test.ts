import { describe, expect, it, vi } from 'vitest'
import { ExperimentRunStatus, OcrStatus } from '@prisma/client'
import { useTestService } from '@/test-service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { QueueProducerService } from '@/queue/producer/queueProducer.service'
import { AnnotationAttachmentService } from '../services/annotationAttachment.service'
import { OcrService } from '@/ocr/ocr.service'

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

const seedBriefingAndNote = async (
  orgSlug: string,
  userId: number = service.user.id,
) => {
  const eo = await seedElectedOffice(orgSlug, userId)
  const briefingRun = await service.prisma.experimentRun.create({
    data: {
      organizationSlug: orgSlug,
      experimentType: 'meeting_briefing',
      status: ExperimentRunStatus.COMPLETED,
    },
  })
  const briefing = await service.prisma.meetingBriefing.create({
    data: {
      electedOfficeId: eo.id,
      meetingDate: new Date('2026-06-08T00:00:00Z'),
      meetingTime: '19:00',
      meetingTimezone: 'America/Denver',
      experimentRunId: briefingRun.runId,
      artifactBucket: 'briefing-bucket',
      artifactKey: '2026-06-08.json',
    },
  })
  const annotation = await service.prisma.annotation.create({
    data: {
      author: { connect: { id: userId } },
      kind: 'note',
      resourceType: 'briefing',
      resourceId: briefing.id,
      note: { create: { body: null } },
    },
    include: { note: true },
  })
  return { eo, briefing, annotation, noteId: annotation.noteId! }
}

const orgHeader = (slug: string) => ({
  headers: { 'x-organization-slug': slug },
})

const validPresign = {
  file_name: 'photo.jpg',
  mime_type: 'image/jpeg' as const,
  size_bytes: 1_500_000,
}

const mockS3 = () => {
  const s3 = service.app.get(S3Service)
  return {
    upload: vi
      .spyOn(s3, 'getSignedUrlForUpload')
      .mockResolvedValue('https://s3.example/upload-url'),
    view: vi
      .spyOn(s3, 'getSignedUrlForViewing')
      .mockResolvedValue('https://s3.example/download-url'),
    exists: vi.spyOn(s3, 'getObjectSize').mockResolvedValue(1_500_000),
    get: vi.spyOn(s3, 'getFileBytes').mockResolvedValue(Buffer.from('binary')),
    del: vi.spyOn(s3, 'deleteObject').mockResolvedValue(undefined),
  }
}

const mockQueue = () => {
  const q = service.app.get(QueueProducerService)
  return vi.spyOn(q, 'sendMessage').mockResolvedValue(undefined as never)
}

describe('POST /v1/annotations/:annotationId/note/attachments/presign', () => {
  it('returns a signed URL and creates a pending attachment row', async () => {
    const { annotation, noteId } = await seedBriefingAndNote('eo-presign')
    const s3 = mockS3()

    const result = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      validPresign,
      orgHeader('eo-presign'),
    )

    expect(result.status).toBe(201)
    expect(result.data).toMatchObject({
      upload_url: 'https://s3.example/upload-url',
    })
    expect(typeof result.data.attachment_id).toBe('string')

    const row = await service.prisma.annotationNoteAttachment.findUnique({
      where: { id: result.data.attachment_id },
    })
    expect(row).toMatchObject({
      noteId,
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1_500_000,
      ocrStatus: OcrStatus.pending,
    })
    expect(s3.upload).toHaveBeenCalledOnce()
  })

  it('rejects another attachment once the per-note cap is reached', async () => {
    const { annotation } = await seedBriefingAndNote('eo-cap')
    mockS3()

    // The service caps attachments at 20 per note. Fill it up, then assert
    // the 21st request is forbidden.
    for (let i = 0; i < 20; i++) {
      const accepted = await service.client.post(
        `/v1/annotations/${annotation.id}/note/attachments/presign`,
        validPresign,
        orgHeader('eo-cap'),
      )
      expect(accepted.status).toBe(201)
    }

    const overflow = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      validPresign,
      orgHeader('eo-cap'),
    )
    expect(overflow.status).toBe(403)
  })

  it('rejects disallowed mime types', async () => {
    const { annotation } = await seedBriefingAndNote('eo-mime')
    mockS3()

    const result = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      { ...validPresign, mime_type: 'application/zip' },
      orgHeader('eo-mime'),
    )

    expect(result.status).toBe(400)
  })

  it('rejects files larger than the 20 MB cap', async () => {
    const { annotation } = await seedBriefingAndNote('eo-size')
    mockS3()

    const result = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      { ...validPresign, size_bytes: 21 * 1024 * 1024 },
      orgHeader('eo-size'),
    )

    expect(result.status).toBe(400)
  })

  it('rejects when the annotation belongs to a different user', async () => {
    const otherUser = await service.prisma.user.create({
      data: {
        clerkId: 'other_presign',
        email: 'other@goodparty.org',
        firstName: 'A',
        lastName: 'B',
      },
    })
    const { annotation } = await seedBriefingAndNote('eo-foreign', otherUser.id)

    // The requesting user owns a different elected office so the org-header
    // route resolves to "no access" before the author check fires.
    await seedElectedOffice('eo-mine-presign')
    mockS3()

    const result = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      validPresign,
      orgHeader('eo-mine-presign'),
    )

    expect(result.status).toBe(403)
  })
})

describe('POST /v1/annotations/:annotationId/note/attachments/:attachmentId/complete', () => {
  it('enqueues an OCR job once S3 confirms the upload', async () => {
    const { annotation } = await seedBriefingAndNote('eo-complete')
    const s3 = mockS3()
    const queue = mockQueue()

    const presign = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      validPresign,
      orgHeader('eo-complete'),
    )
    expect(presign.status).toBe(201)

    const result = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/${presign.data.attachment_id}/complete`,
      {},
      orgHeader('eo-complete'),
    )

    expect(result.status).toBe(204)
    expect(s3.exists).toHaveBeenCalled()
    expect(queue).toHaveBeenCalledOnce()
  })

  it('returns 400 when the file has not actually landed in S3', async () => {
    const { annotation } = await seedBriefingAndNote('eo-missing-upload')
    const s3 = mockS3()
    s3.exists.mockResolvedValueOnce(undefined as never)
    mockQueue()

    const presign = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      validPresign,
      orgHeader('eo-missing-upload'),
    )

    const result = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/${presign.data.attachment_id}/complete`,
      {},
      orgHeader('eo-missing-upload'),
    )

    expect(result.status).toBe(400)
  })
})

describe('GET /v1/annotations/:annotationId/note/attachments/:attachmentId/download-url', () => {
  it('returns a presigned S3 GET URL plus an ISO expiry', async () => {
    const { annotation } = await seedBriefingAndNote('eo-download')
    const s3 = mockS3()

    const presign = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      validPresign,
      orgHeader('eo-download'),
    )
    expect(presign.status).toBe(201)
    const attachmentId = presign.data.attachment_id

    const result = await service.client.get(
      `/v1/annotations/${annotation.id}/note/attachments/${attachmentId}/download-url`,
      orgHeader('eo-download'),
    )

    expect(result.status).toBe(200)
    expect(result.data).toMatchObject({
      download_url: 'https://s3.example/download-url',
    })
    expect(typeof result.data.expires_at).toBe('string')
    expect(Number.isNaN(Date.parse(result.data.expires_at))).toBe(false)
    expect(s3.view).toHaveBeenCalledOnce()
  })

  it('returns 404 for an unknown attachment id', async () => {
    const { annotation } = await seedBriefingAndNote('eo-download-missing')
    mockS3()

    const result = await service.client.get(
      `/v1/annotations/${annotation.id}/note/attachments/does-not-exist/download-url`,
      orgHeader('eo-download-missing'),
    )

    expect(result.status).toBe(404)
  })

  it('rejects callers who do not own the annotation', async () => {
    const { annotation } = await seedBriefingAndNote('eo-download-owner')
    mockS3()

    const presign = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      validPresign,
      orgHeader('eo-download-owner'),
    )
    expect(presign.status).toBe(201)
    const attachmentId = presign.data.attachment_id

    // Seed a second elected office and use its header — that user does
    // not own the annotation, so the briefing-access check should 403.
    await seedElectedOffice('eo-download-other')
    const result = await service.client.get(
      `/v1/annotations/${annotation.id}/note/attachments/${attachmentId}/download-url`,
      orgHeader('eo-download-other'),
    )

    expect(result.status).toBe(403)
  })
})

describe('DELETE /v1/annotations/:annotationId/note/attachments/:attachmentId', () => {
  it('removes the attachment row and best-effort deletes the S3 object', async () => {
    const { annotation } = await seedBriefingAndNote('eo-delete-att')
    const s3 = mockS3()

    const presign = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      validPresign,
      orgHeader('eo-delete-att'),
    )
    expect(presign.status).toBe(201)
    const attachmentId = presign.data.attachment_id

    const result = await service.client.delete(
      `/v1/annotations/${annotation.id}/note/attachments/${attachmentId}`,
      orgHeader('eo-delete-att'),
    )

    expect(result.status).toBe(204)
    expect(
      await service.prisma.annotationNoteAttachment.findUnique({
        where: { id: attachmentId },
      }),
    ).toBeNull()
    expect(s3.del).toHaveBeenCalled()
  })

  it('returns 404 when the attachment does not exist', async () => {
    const { annotation } = await seedBriefingAndNote('eo-delete-missing')
    mockS3()

    const result = await service.client.delete(
      `/v1/annotations/${annotation.id}/note/attachments/does-not-exist`,
      orgHeader('eo-delete-missing'),
    )

    expect(result.status).toBe(404)
  })
})

describe('AnnotationAttachmentService.runOcr', () => {
  it('writes ocrText and completed status on success', async () => {
    const { annotation } = await seedBriefingAndNote('eo-ocr-success')
    mockS3()
    mockQueue()

    const presign = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      validPresign,
      orgHeader('eo-ocr-success'),
    )
    const attachmentId = presign.data.attachment_id

    const ocr = service.app.get(OcrService)
    vi.spyOn(ocr, 'process').mockResolvedValue({
      text: 'detected text',
      confidence: 0.95,
      meta: { provider: 'fake' },
      ocrStatus: OcrStatus.completed,
    })

    const attachments = service.app.get(AnnotationAttachmentService)
    await attachments.runOcr(attachmentId)

    const row = await service.prisma.annotationNoteAttachment.findUnique({
      where: { id: attachmentId },
    })
    expect(row?.ocrStatus).toBe(OcrStatus.completed)
    expect(row?.ocrText).toBe('detected text')
    expect(row?.ocrCompletedAt).not.toBeNull()
  })

  it('backfills the parent note body with OCR text when body was null', async () => {
    const { annotation, noteId } = await seedBriefingAndNote('eo-ocr-backfill')
    mockS3()
    mockQueue()

    const presign = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      validPresign,
      orgHeader('eo-ocr-backfill'),
    )
    const attachmentId = presign.data.attachment_id

    const ocr = service.app.get(OcrService)
    vi.spyOn(ocr, 'process').mockResolvedValue({
      text: 'extracted body content',
      confidence: 0.9,
      meta: {},
      ocrStatus: OcrStatus.completed,
    })

    await service.app.get(AnnotationAttachmentService).runOcr(attachmentId)

    const note = await service.prisma.annotationNote.findUnique({
      where: { id: noteId },
    })
    expect(note?.body).toBe('extracted body content')
  })

  it('does not overwrite a body the user typed', async () => {
    const eo = await seedElectedOffice('eo-ocr-noclobber')
    const briefing = await service.prisma.experimentRun
      .create({
        data: {
          organizationSlug: 'eo-ocr-noclobber',
          experimentType: 'meeting_briefing',
          status: ExperimentRunStatus.COMPLETED,
        },
      })
      .then((run) =>
        service.prisma.meetingBriefing.create({
          data: {
            electedOfficeId: eo.id,
            meetingDate: new Date('2026-06-08T00:00:00Z'),
            meetingTime: '19:00',
            meetingTimezone: 'America/Denver',
            experimentRunId: run.runId,
            artifactBucket: 'briefing-bucket',
            artifactKey: 'noclobber.json',
          },
        }),
      )
    const annotation = await service.prisma.annotation.create({
      data: {
        author: { connect: { id: service.user.id } },
        kind: 'note',
        resourceType: 'briefing',
        resourceId: briefing.id,
        note: { create: { body: 'user-typed caption' } },
      },
      include: { note: true },
    })
    mockS3()
    mockQueue()

    const presign = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      validPresign,
      orgHeader('eo-ocr-noclobber'),
    )
    const attachmentId = presign.data.attachment_id

    const ocr = service.app.get(OcrService)
    vi.spyOn(ocr, 'process').mockResolvedValue({
      text: 'OCR text that should NOT win',
      confidence: 0.9,
      meta: {},
      ocrStatus: OcrStatus.completed,
    })

    await service.app.get(AnnotationAttachmentService).runOcr(attachmentId)

    const note = await service.prisma.annotationNote.findUnique({
      where: { id: annotation.noteId! },
    })
    expect(note?.body).toBe('user-typed caption')
  })

  it('writes failed status + error message when the provider throws', async () => {
    const { annotation } = await seedBriefingAndNote('eo-ocr-fail')
    mockS3()
    mockQueue()

    const presign = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      validPresign,
      orgHeader('eo-ocr-fail'),
    )
    const attachmentId = presign.data.attachment_id

    const ocr = service.app.get(OcrService)
    vi.spyOn(ocr, 'process').mockRejectedValue(new Error('textract_down'))

    const attachments = service.app.get(AnnotationAttachmentService)
    await attachments.runOcr(attachmentId)

    const row = await service.prisma.annotationNoteAttachment.findUnique({
      where: { id: attachmentId },
    })
    expect(row?.ocrStatus).toBe(OcrStatus.failed)
    expect(row?.ocrError).toBe('textract_down')
  })

  it('is idempotent for already-completed attachments', async () => {
    const { annotation } = await seedBriefingAndNote('eo-ocr-idem')
    mockS3()
    mockQueue()

    const presign = await service.client.post(
      `/v1/annotations/${annotation.id}/note/attachments/presign`,
      validPresign,
      orgHeader('eo-ocr-idem'),
    )
    const attachmentId = presign.data.attachment_id

    await service.prisma.annotationNoteAttachment.update({
      where: { id: attachmentId },
      data: {
        ocrStatus: OcrStatus.completed,
        ocrText: 'already there',
        ocrCompletedAt: new Date(),
      },
    })

    const ocr = service.app.get(OcrService)
    const processSpy = vi.spyOn(ocr, 'process')

    const attachments = service.app.get(AnnotationAttachmentService)
    await attachments.runOcr(attachmentId)

    expect(processSpy).not.toHaveBeenCalled()
    const row = await service.prisma.annotationNoteAttachment.findUnique({
      where: { id: attachmentId },
    })
    expect(row?.ocrText).toBe('already there')
  })
})
