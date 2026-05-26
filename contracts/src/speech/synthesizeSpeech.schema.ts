import { z } from 'zod'

export const SPEECH_SYNTHESIS_ENGINE_VALUES = [
  'neural',
  'standard',
  'generative',
] as const
export type SpeechSynthesisEngine =
  (typeof SPEECH_SYNTHESIS_ENGINE_VALUES)[number]
export const SpeechSynthesisEngineSchema = z.enum(
  SPEECH_SYNTHESIS_ENGINE_VALUES,
)

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
  'Amy',
] as const
export type SpeechSynthesisVoice =
  (typeof SPEECH_SYNTHESIS_VOICE_VALUES)[number]
export const SpeechSynthesisVoiceSchema = z.enum(SPEECH_SYNTHESIS_VOICE_VALUES)

export const GENERATIVE_VOICE_VALUES: readonly SpeechSynthesisVoice[] = [
  'Joanna',
  'Matthew',
  'Salli',
  'Ruth',
  'Stephen',
  'Amy',
]

/**
 * Hard cap on a single synthesis request, in characters of text. Sized to
 * cover a typical full meeting briefing read-out (~5,000 words / 30,000
 * chars) with comfortable headroom while preventing runaway costs from a
 * malicious or buggy caller.
 */
export const SYNTHESIZE_SPEECH_MAX_TEXT_LENGTH = 50_000

export const SynthesizeSpeechRequestSchema = z.object({
  /**
   * The plain text to synthesize. The server splits this into Polly-sized
   * chunks at sentence boundaries, caches each chunk by content hash, and
   * returns ordered presigned URLs for the client to play in sequence.
   *
   * The caller owns text rendering: pre-render any domain object (briefing,
   * note, etc.) into the exact words you want spoken. Markdown markers and
   * link syntax should be stripped client-side; the speech service does
   * not interpret them.
   */
  text: z
    .string()
    .min(1, 'text must not be empty')
    .max(
      SYNTHESIZE_SPEECH_MAX_TEXT_LENGTH,
      `text must be at most ${SYNTHESIZE_SPEECH_MAX_TEXT_LENGTH} characters`,
    ),
  options: z
    .object({
      voiceId: SpeechSynthesisVoiceSchema.default('Amy'),
      engine: SpeechSynthesisEngineSchema.default('generative'),
    })
    .refine(
      ({ voiceId, engine }) =>
        engine !== 'generative' ||
        GENERATIVE_VOICE_VALUES.includes(voiceId),
      { message: 'Selected voice does not support the generative engine' },
    )
    .optional(),
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
