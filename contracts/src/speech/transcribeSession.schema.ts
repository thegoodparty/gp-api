import { z } from 'zod'

export const SPEECH_TO_TEXT_TARGET_TYPE_VALUES = ['note'] as const
export type SpeechToTextTargetType =
  (typeof SPEECH_TO_TEXT_TARGET_TYPE_VALUES)[number]
export const SpeechToTextTargetTypeSchema = z.enum(
  SPEECH_TO_TEXT_TARGET_TYPE_VALUES,
)

export const TranscribeSessionRequestSchema = z.object({
  target: z.object({
    type: SpeechToTextTargetTypeSchema,
    id: z.string().min(1),
  }),
})
export type TranscribeSessionRequest = z.infer<
  typeof TranscribeSessionRequestSchema
>

export const TranscribeSessionResponseSchema = z.object({
  wsUrl: z.string().url(),
  expiresAt: z.string().datetime(),
})
export type TranscribeSessionResponse = z.infer<
  typeof TranscribeSessionResponseSchema
>
