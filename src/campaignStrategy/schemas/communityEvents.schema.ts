import { z } from 'zod'

// Shared persisted / response schemas live in @goodparty_org/contracts —
// import from there for any cross-service shape (CommunityEvent,
// CommunityEventsResult, CommunityEventsResponse, etc.). Only the
// LLM-facing raw shapes below are local to gp-api, since they describe
// the structured-output prompt contract and aren't crossed by any other
// service.

const HttpsOrHttpUrl = z
  .string()
  .url()
  .refine(
    (value) => /^https?:$/.test(new URL(value).protocol),
    'Only http and https URLs are allowed',
  )

/**
 * LLM-facing shape: snake_case fields plus the optional `address` /
 * `url` keys to match what the structured-output prompt emits. The
 * service normalizes this into the persisted `CommunityEventSchema`
 * (from contracts) before writing to the campaign_strategy row.
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

export type CommunityEventRaw = z.infer<typeof CommunityEventRawSchema>
export type CommunityEventsRaw = z.infer<typeof CommunityEventsRawSchema>
