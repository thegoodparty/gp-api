import { z } from 'zod'

export const SPEECH_SYNTHESIS_TARGET_TYPE_VALUES = ['MeetingBriefing'] as const
export type SpeechSynthesisTargetType =
  (typeof SPEECH_SYNTHESIS_TARGET_TYPE_VALUES)[number]
export const SpeechSynthesisTargetTypeSchema = z.enum(
  SPEECH_SYNTHESIS_TARGET_TYPE_VALUES,
)

export const SPEECH_SYNTHESIS_ENGINE_VALUES = ['neural', 'standard'] as const
export type SpeechSynthesisEngine =
  (typeof SPEECH_SYNTHESIS_ENGINE_VALUES)[number]
export const SpeechSynthesisEngineSchema = z.enum(
  SPEECH_SYNTHESIS_ENGINE_VALUES,
)

// Allowlist of voices supported by Polly that we explicitly enable for v1.
// Add to this list intentionally — anything else is rejected at the API
// boundary so we can't accidentally bill for unbounded voices.
export const SPEECH_SYNTHESIS_VOICE_VALUES = [
  'Joanna',
  'Matthew',
  'Ivy',
  'Kendra',
  'Kimberly',
  'Salli',
  'Joey',
  'Justin',
  'Ruth',
  'Stephen',
] as const
export type SpeechSynthesisVoice =
  (typeof SPEECH_SYNTHESIS_VOICE_VALUES)[number]
export const SpeechSynthesisVoiceSchema = z.enum(
  SPEECH_SYNTHESIS_VOICE_VALUES,
)

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const SynthesizeSpeechRequestSchema = z
  .object({
    target: z.object({
      type: SpeechSynthesisTargetTypeSchema,
      id: z.string().min(1),
    }),
    options: z
      .object({
        voiceId: SpeechSynthesisVoiceSchema.default('Joanna'),
        engine: SpeechSynthesisEngineSchema.default('neural'),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.target.type === 'MeetingBriefing' &&
      !ISO_DATE_REGEX.test(value.target.id)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target', 'id'],
        message: 'MeetingBriefing target.id must be in YYYY-MM-DD format',
      })
    }
  })
export type SynthesizeSpeechRequest = z.infer<
  typeof SynthesizeSpeechRequestSchema
>

export const SynthesizeSpeechSegmentSchema = z.object({
  index: z.number().int().nonnegative(),
  url: z.string().url(),
  expiresInSeconds: z.number().int().positive(),
})
export type SynthesizeSpeechSegment = z.infer<
  typeof SynthesizeSpeechSegmentSchema
>

export const SynthesizeSpeechResponseSchema = z.object({
  format: z.literal('audio/mpeg'),
  segments: z.array(SynthesizeSpeechSegmentSchema),
})
export type SynthesizeSpeechResponse = z.infer<
  typeof SynthesizeSpeechResponseSchema
>
