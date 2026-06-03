import { z } from 'zod'

const HttpsOrHttpUrl = z
  .string()
  .url()
  .refine(
    (value) => /^https?:$/.test(new URL(value).protocol),
    'Only http and https URLs are allowed',
  )

/**
 * One community event row rendered in Section 7 of the campaign plan.
 * Sourced from BR / Google Search via Gemini in gp-api's
 * `CommunityEventsService`. Stored on the
 * `campaign_strategy.community_events` JSON column.
 */
export const CommunityEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  /** YYYY-MM-DD; events outside `[today, electionDate]` are filtered out server-side. */
  date: z.string().min(1),
  /**
   * Physical street address of the event venue (e.g.
   * "123 Main St, Springfield, MA 01103"). `null` when the search data
   * didn't surface one — gp-api's prompt explicitly instructs the model
   * to return null rather than invent an address.
   */
  address: z.string().nullable(),
  /** Direct event page URL when one is present in the search results; null otherwise. */
  url: HttpsOrHttpUrl.nullable(),
})

/**
 * Persisted shape and ready-state payload. Capped at 3 events per the
 * Campaign Plan Template § 7 spec; the array can legitimately be empty
 * when no qualifying events exist in the window — the UI renders an
 * empty state without re-polling.
 */
export const CommunityEventsResultSchema = z.object({
  events: z.array(CommunityEventSchema).max(3),
})

export const CommunityEventsReadySchema = z.object({
  status: z.literal('ready'),
  data: CommunityEventsResultSchema,
})

export const CommunityEventsGeneratingSchema = z.object({
  status: z.literal('generating'),
})

/**
 * Polling response. Same shape as `StrategicLandscapeResponseSchema` so
 * clients can reuse the discriminated-union polling pattern.
 */
export const CommunityEventsResponseSchema = z.discriminatedUnion('status', [
  CommunityEventsReadySchema,
  CommunityEventsGeneratingSchema,
])

export type CommunityEvent = z.infer<typeof CommunityEventSchema>
export type CommunityEventsResult = z.infer<typeof CommunityEventsResultSchema>
export type CommunityEventsResponse = z.infer<
  typeof CommunityEventsResponseSchema
>
