import { z } from 'zod'

export const OpportunitiesSchema = z.object({
  opportunities: z.array(z.string().min(1)).max(3),
})

export const ChallengesSchema = z.object({
  challenges: z.array(z.string().min(1)).max(3),
})

const HttpsOrHttpUrl = z
  .string()
  .url()
  .refine(
    (value) => /^https?:$/.test(new URL(value).protocol),
    'Only http and https URLs are allowed',
  )

// LLM-facing shape: snake_case to match the prompt spec. Only full_name,
// party_affiliation, and incumbent are required — the model may legitimately
// have nothing to put in the optional fields for a given opponent.
export const OpponentRawSchema = z.object({
  full_name: z.string().min(1),
  party_affiliation: z.string().min(1),
  incumbent: z.boolean().nullable(),
  political_summary: z.string().optional(),
  key_facts: z.array(z.string().min(1)).max(3).optional(),
  websites: z.array(HttpsOrHttpUrl).optional(),
})

export const OppositionResearchRawSchema = z.object({
  opponents: z.array(OpponentRawSchema),
})

// Internal shape: camelCase, no optionals — service-level mapper fills the
// missing optional fields with safe defaults so the persister and API
// response always see a consistent shape.
export const OpponentSchema = z.object({
  fullName: z.string().min(1),
  partyAffiliation: z.string().min(1),
  incumbent: z.boolean().nullable(),
  politicalSummary: z.string(),
  keyFacts: z.array(z.string().min(1)).max(3),
  websites: z.array(HttpsOrHttpUrl),
})

export const StrategicLandscapeResultSchema = z.object({
  opportunities: z.array(z.string().min(1)).max(3),
  challenges: z.array(z.string().min(1)).max(3),
  opponents: z.array(OpponentSchema),
})

export type OpportunitiesResult = z.infer<typeof OpportunitiesSchema>
export type ChallengesResult = z.infer<typeof ChallengesSchema>
export type OpponentRaw = z.infer<typeof OpponentRawSchema>
export type OppositionResearchRaw = z.infer<typeof OppositionResearchRawSchema>
export type Opponent = z.infer<typeof OpponentSchema>
export type StrategicLandscapeResult = z.infer<
  typeof StrategicLandscapeResultSchema
>
