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
 * reserved for Collin's eventual chat module.
 */

export const ANNOTATION_KIND_VALUES = ['note', 'chat', 'bug_report'] as const
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
 * Anchor: either all three fields are set (text-anchored) or all three
 * are null (page-level / top-level annotation). Mixed states are rejected.
 */
export const AnnotationAnchorSchema = z
  .object({
    json_path: z.string().min(1).nullable(),
    start: z.number().int().min(0).nullable(),
    end: z.number().int().min(0).nullable(),
  })
  .refine(
    (a) => {
      const all = a.json_path !== null && a.start !== null && a.end !== null
      const none = a.json_path === null && a.start === null && a.end === null
      return all || none
    },
    { message: 'anchor must have all of json_path/start/end set or all null' },
  )
  .refine((a) => a.start === null || a.end === null || a.start < a.end, {
    message: 'start must be less than end',
  })

export type AnnotationAnchor = z.infer<typeof AnnotationAnchorSchema>

// ---------------------------------------------------------------------------
// Kind-specific payload shapes
// ---------------------------------------------------------------------------

export const AnnotationNoteSchema = z.object({
  id: z.string(),
  body: z.string(),
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
})
export type Annotation = z.infer<typeof AnnotationSchema>

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const noteBodySchema = z.string().max(10_000)
const bugReportDescriptionSchema = z.string().min(1).max(4_000)

export const CreateAnnotationRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('note'),
    anchor: AnnotationAnchorSchema,
    payload: z.object({
      body: noteBodySchema,
    }),
  }),
  z.object({
    kind: z.literal('bug_report'),
    anchor: AnnotationAnchorSchema,
    payload: z.object({
      description: bugReportDescriptionSchema,
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
