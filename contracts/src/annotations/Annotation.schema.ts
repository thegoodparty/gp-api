import { z } from 'zod'

/**
 * Annotation contract shared between gp-api and gp-webapp.
 *
 * Anchor model: see BRIEFING-ANNOTATIONS-API-PLAN.md
 *   - jsonPath is a JSON Pointer (RFC 6901) into the briefing artifact,
 *     e.g. "/action_items/0/overview". Null for top-level annotations.
 *   - start / end are zero-indexed character offsets, half-open [start, end).
 *     Both null when jsonPath is null.
 *
 * Only the `note` and `bug_report` kinds are wired in v1. `chat` is
 * reserved for Collin's eventual chat module. `review` is admin-only:
 * it can only be created inside an impersonation session and is never
 * returned to non-impersonated callers (server-side default-deny).
 */

export const ANNOTATION_KIND_VALUES = [
  'note',
  'chat',
  'bug_report',
  'review',
] as const
export const AnnotationKindSchema = z.enum(ANNOTATION_KIND_VALUES)
export type AnnotationKind = z.infer<typeof AnnotationKindSchema>

export const ANNOTATION_RESOURCE_TYPE_VALUES = ['briefing'] as const
export const AnnotationResourceTypeSchema = z.enum(
  ANNOTATION_RESOURCE_TYPE_VALUES,
)
export type AnnotationResourceType = z.infer<
  typeof AnnotationResourceTypeSchema
>

/**
 * Anchor: one of three valid shapes
 *   - Passage-anchored: all three of `json_path`, `start`, `end` are set.
 *     The annotation maps to a character range inside that node.
 *   - Card-level:       `json_path` is set, both `start` and `end` are null.
 *     The annotation is scoped to a whole card / artifact node without a
 *     passage selection — e.g. a note attached to an entire agenda item.
 *   - Briefing-wide:    all three are null. Legacy / page-scoped annotation.
 *
 * The (json_path null AND start/end set) combination is rejected — you
 * can't reference an offset without a node to apply it to.
 */
export const AnnotationAnchorSchema = z
  .object({
    json_path: z.string().min(1).nullable(),
    start: z.number().int().min(0).nullable(),
    end: z.number().int().min(0).nullable(),
  })
  .refine(
    (a) => {
      const passage = a.json_path !== null && a.start !== null && a.end !== null
      const cardLevel =
        a.json_path !== null && a.start === null && a.end === null
      const briefingWide =
        a.json_path === null && a.start === null && a.end === null
      return passage || cardLevel || briefingWide
    },
    {
      message:
        'anchor must be passage-anchored (all set), card-level (json_path only), or briefing-wide (all null)',
    },
  )
  .refine((a) => a.start === null || a.end === null || a.start < a.end, {
    message: 'start must be less than end',
  })

export type AnnotationAnchor = z.infer<typeof AnnotationAnchorSchema>

// ---------------------------------------------------------------------------
// Kind-specific payload shapes
// ---------------------------------------------------------------------------

export const OCR_STATUS_VALUES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'skipped',
] as const
export const OcrStatusSchema = z.enum(OCR_STATUS_VALUES)
export type OcrStatus = z.infer<typeof OcrStatusSchema>

export const AnnotationNoteAttachmentSchema = z.object({
  id: z.string(),
  file_name: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  ocr_status: OcrStatusSchema,
  ocr_text: z.string().nullable(),
  ocr_error: z.string().nullable(),
  ocr_completed_at: z.string().nullable(),
  created_at: z.string(),
})
export type AnnotationNoteAttachment = z.infer<
  typeof AnnotationNoteAttachmentSchema
>

export const AnnotationNoteSchema = z.object({
  id: z.string(),
  // Optional once a note can be attachment-only (no typed body). Phase 1
  // create requires a body, but the response shape is nullable for forward
  // compatibility with Phase 2.
  body: z.string().nullable(),
  attachments: z.array(AnnotationNoteAttachmentSchema),
  created_at: z.string(),
  updated_at: z.string(),
})
export type AnnotationNote = z.infer<typeof AnnotationNoteSchema>

export const AnnotationBugReportSchema = z.object({
  id: z.string(),
  description: z.string(),
  submitted_at: z.string(),
})
export type AnnotationBugReport = z.infer<typeof AnnotationBugReportSchema>

export const AnnotationChatSchema = z.object({
  id: z.string(),
  created_at: z.string(),
})
export type AnnotationChat = z.infer<typeof AnnotationChatSchema>

// reviewer_clerk_sub is intentionally omitted — the admin's Clerk subject
// is internal reviewer attribution and never leaves the server.
export const AnnotationReviewSchema = z.object({
  id: z.string(),
  body: z.string(),
  reviewer_email: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type AnnotationReview = z.infer<typeof AnnotationReviewSchema>

// ---------------------------------------------------------------------------
// The annotation row as returned by the API
// ---------------------------------------------------------------------------

export const AnnotationSchema = z.object({
  id: z.string(),
  kind: AnnotationKindSchema,
  resource_type: AnnotationResourceTypeSchema,
  resource_id: z.string(),
  author_user_id: z.number().int(),
  json_path: z.string().nullable(),
  start: z.number().int().nullable(),
  end: z.number().int().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  note: AnnotationNoteSchema.optional(),
  chat: AnnotationChatSchema.optional(),
  bug_report: AnnotationBugReportSchema.optional(),
  review: AnnotationReviewSchema.optional(),
})
export type Annotation = z.infer<typeof AnnotationSchema>

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const noteBodySchema = z.string().min(1).max(10_000)
const bugReportDescriptionSchema = z.string().min(1).max(4_000)
const reviewBodySchema = z.string().min(1).max(10_000)

export const CreateAnnotationRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('note'),
    anchor: AnnotationAnchorSchema,
    payload: z.object({
      // Optional once attachment-only notes ship (Phase 2). When present,
      // `noteBodySchema` still enforces min(1) so empty strings are rejected.
      body: noteBodySchema.optional(),
    }),
  }),
  z.object({
    kind: z.literal('bug_report'),
    anchor: AnnotationAnchorSchema,
    payload: z.object({
      description: bugReportDescriptionSchema,
    }),
  }),
  z.object({
    kind: z.literal('review'),
    anchor: AnnotationAnchorSchema,
    payload: z.object({
      body: reviewBodySchema,
    }),
  }),
])
export type CreateAnnotationRequest = z.infer<
  typeof CreateAnnotationRequestSchema
>

export const UpdateNoteRequestSchema = z.object({
  body: noteBodySchema,
})
export type UpdateNoteRequest = z.infer<typeof UpdateNoteRequestSchema>

// ---------------------------------------------------------------------------
// Attachment request shapes (Phase 2 — camera / upload intake)
// ---------------------------------------------------------------------------

const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024 // 20 MB
// Limited to what the OCR pipeline can actually read end-to-end. Textract's
// DetectDocumentText accepts only JPEG / PNG / PDF / TIFF, so allowing heic
// or webp here would land the attachment in S3 but always fail OCR. HEIC
// support is a Phase 3 conversion step. PDF/DOCX/TXT go through their own
// extractors (pdf-parse / mammoth / direct read), not Textract.
const ATTACHMENT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const

export const AttachmentPresignRequestSchema = z.object({
  file_name: z.string().min(1).max(255),
  mime_type: z.enum(ATTACHMENT_ALLOWED_MIME_TYPES),
  size_bytes: z.number().int().positive().max(ATTACHMENT_MAX_BYTES),
})
export type AttachmentPresignRequest = z.infer<
  typeof AttachmentPresignRequestSchema
>

export const AttachmentPresignResponseSchema = z.object({
  attachment_id: z.string(),
  upload_url: z.string(),
  storage_key: z.string(),
})
export type AttachmentPresignResponse = z.infer<
  typeof AttachmentPresignResponseSchema
>

/**
 * Response from the GET-style "download URL" endpoint. The URL is a
 * pre-signed S3 GET that clients can hit directly (for `<img src>` or
 * `window.open`) without proxying bytes through gp-api. Short-lived;
 * `expires_at` is an ISO timestamp the client can use to refetch
 * before it lapses.
 */
export const AttachmentDownloadUrlResponseSchema = z.object({
  download_url: z.string(),
  expires_at: z.string(),
})
export type AttachmentDownloadUrlResponse = z.infer<
  typeof AttachmentDownloadUrlResponseSchema
>

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const AnnotationResponseSchema = AnnotationSchema
export type AnnotationResponse = z.infer<typeof AnnotationResponseSchema>

export const AnnotationsListResponseSchema = z.object({
  annotations: z.array(AnnotationSchema),
})
export type AnnotationsListResponse = z.infer<
  typeof AnnotationsListResponseSchema
>
