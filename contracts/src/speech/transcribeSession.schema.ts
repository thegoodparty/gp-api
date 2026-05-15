import { z } from 'zod'

/**
 * Request body for `POST /v1/speech/transcribe/session`.
 *
 * The speech service is a pure pipe: it accepts audio and returns
 * transcripts without knowing what the transcript is for. Persistence
 * of the resulting text (e.g. saving to a note) is the caller's
 * responsibility, performed against whichever domain API owns it.
 *
 * Reserved as an empty object (rather than no body) so we can add
 * server-influencing options here later — language hints, partial
 * cadence, vocabulary — without a breaking shape change.
 */
export const TranscribeSessionRequestSchema = z.object({})
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
