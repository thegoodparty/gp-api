import { z } from 'zod'

const HttpsOrHttpUrl = z
  .string()
  .url()
  .refine(
    (value) => /^https?:$/.test(new URL(value).protocol),
    'Only http and https URLs are allowed',
  )

/**
 * LLM-facing shape: snake_case to match the structured-output prompt spec.
 * Extends `LlmEventResult` in
 * `gp-ai-projects/campaign_plan_lambda/event_generator.py` with an
 * `address` field for the venue's physical street address (Section 7
 * of the ClickUp Campaign Plan Template renders this in the Address
 * column). `url` and `address` are independently optional because many
 * search results have one or the other but not both.
 */
export const CommunityEventRawSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  // YYYY-MM-DD. The structured prompt instructs the model to emit this
  // format; downstream validation in the service drops events with
  // unparseable dates rather than failing the whole response.
  date: z.string().min(1),
  // Physical street address of the event venue. Should be a real address
  // ("123 Main St, Springfield, MA 01103"), not a URL or city-only.
  // Model is instructed to return null when no address is in the search
  // data — never to invent one.
  address: z.string().nullable().optional(),
  url: HttpsOrHttpUrl.nullable().optional(),
})

export const CommunityEventsRawSchema = z.object({
  events: z.array(CommunityEventRawSchema),
})

/**
 * Internal / persisted shape. `url` is normalized to `string | null` (the
 * Python pipeline used the same shape) and the array is clamped to a max
 * of 3 events per the ClickUp Campaign Plan Template § 7 spec. The lower
 * bound is 0 — an LLM run that legitimately found no events should still
 * resolve to `ready` with an empty array so the webapp can render the
 * "No Community Events Found" empty state without re-polling forever.
 */
export const CommunityEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  date: z.string().min(1),
  // Physical address ("123 Main St, Springfield, MA 01103") or null
  // when the search data didn't surface one. Normalized from the
  // LLM-raw shape's optional `address` field by the service.
  address: z.string().nullable(),
  url: HttpsOrHttpUrl.nullable(),
})

export const CommunityEventsResultSchema = z.object({
  events: z.array(CommunityEventSchema).max(3),
})

/**
 * Polling response. Same shape as `StrategicLandscapeResponseSchema` so
 * the webapp's polling hook can reuse the discriminated-union pattern.
 */
export const CommunityEventsReadySchema = z.object({
  status: z.literal('ready'),
  data: CommunityEventsResultSchema,
})

export const CommunityEventsGeneratingSchema = z.object({
  status: z.literal('generating'),
})

export const CommunityEventsResponseSchema = z.discriminatedUnion('status', [
  CommunityEventsReadySchema,
  CommunityEventsGeneratingSchema,
])

export type CommunityEventRaw = z.infer<typeof CommunityEventRawSchema>
export type CommunityEventsRaw = z.infer<typeof CommunityEventsRawSchema>
export type CommunityEvent = z.infer<typeof CommunityEventSchema>
export type CommunityEventsResult = z.infer<typeof CommunityEventsResultSchema>
export type CommunityEventsResponse = z.infer<
  typeof CommunityEventsResponseSchema
>
