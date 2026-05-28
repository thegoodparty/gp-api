import { z } from 'zod'

export const ARTIFACT_RESOURCE_TYPE_VALUES = ['agenda_item'] as const
export const ArtifactResourceTypeSchema = z.enum(ARTIFACT_RESOURCE_TYPE_VALUES)
export type ArtifactResourceType = z.infer<typeof ArtifactResourceTypeSchema>

export const ARTIFACT_FEEDBACK_KIND_VALUES = ['positive', 'negative'] as const
export const ArtifactFeedbackKindSchema = z.enum(ARTIFACT_FEEDBACK_KIND_VALUES)
export type ArtifactFeedbackKind = z.infer<typeof ArtifactFeedbackKindSchema>

/**
 * Free-text the submitter optionally attaches to their vote (typically a
 * 'why this was bad' note on thumbs-down). Mirrors the
 * `artifact_feedback.comment VARCHAR(2000)` column.
 */
const FeedbackCommentSchema = z.string().max(2000).nullable()

export const ArtifactFeedbackSchema = z.object({
  id: z.string(),
  organization_slug: z.string(),
  submitter_user_id: z.number().int(),
  artifact_type: ArtifactResourceTypeSchema,
  artifact_id: z.string(),
  feedback: ArtifactFeedbackKindSchema,
  comment: FeedbackCommentSchema,
  created_at: z.string(),
  updated_at: z.string(),
})
export type ArtifactFeedback = z.infer<typeof ArtifactFeedbackSchema>

// Comment is optional on the request — callers can omit it entirely or
// explicitly pass `null` to clear an existing comment.
export const SetArtifactFeedbackRequestSchema = z.object({
  feedback: ArtifactFeedbackKindSchema,
  comment: FeedbackCommentSchema.optional(),
})
export type SetArtifactFeedbackRequest = z.infer<
  typeof SetArtifactFeedbackRequestSchema
>

export const ArtifactFeedbackResponseSchema = ArtifactFeedbackSchema
export type ArtifactFeedbackResponse = z.infer<
  typeof ArtifactFeedbackResponseSchema
>

export const BriefingFeedbackListResponseSchema = z.object({
  feedback: z.array(ArtifactFeedbackSchema),
})
export type BriefingFeedbackListResponse = z.infer<
  typeof BriefingFeedbackListResponseSchema
>
