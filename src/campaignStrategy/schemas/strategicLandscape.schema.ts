import { z } from 'zod'

// Opponent as stored + returned: who is running, nothing more. Opposition
// research no longer profiles opponents (no summary / facts / websites).
export const OpponentSchema = z.object({
  fullName: z.string().min(1),
  partyAffiliation: z.string().min(1),
  incumbent: z.boolean().nullable(),
})

// Response shape. opponents can be empty (uncontested race); opportunities /
// challenges are 1-3 each once their run completes.
export const StrategicLandscapeResultSchema = z.object({
  opportunities: z.array(z.string().min(1)).max(3),
  challenges: z.array(z.string().min(1)).max(3),
  opponents: z.array(OpponentSchema),
})

export type Opponent = z.infer<typeof OpponentSchema>
export type StrategicLandscapeResult = z.infer<
  typeof StrategicLandscapeResultSchema
>

// Polling response. Once both CAP runs (opposition + opportunities/challenges)
// complete and their sections are persisted, a read returns
// { status: 'ready', data }; otherwise { status: 'generating' } and the
// client polls again.
export const StrategicLandscapeReadySchema = z.object({
  status: z.literal('ready'),
  data: StrategicLandscapeResultSchema,
})

export const StrategicLandscapeGeneratingSchema = z.object({
  status: z.literal('generating'),
})

export const StrategicLandscapeResponseSchema = z.discriminatedUnion('status', [
  StrategicLandscapeReadySchema,
  StrategicLandscapeGeneratingSchema,
])

export type StrategicLandscapeResponse = z.infer<
  typeof StrategicLandscapeResponseSchema
>

// --- CAP artifact shapes (what the experiments write to S3) ---

const OppositionArtifactSchema = z.object({
  opponents: z.array(
    z.object({
      full_name: z.string().min(1),
      party_affiliation: z.string(),
      incumbent: z.boolean().nullable(),
    }),
  ),
})

const OpportunitiesChallengesArtifactSchema = z.object({
  opportunities: z.array(z.string()),
  challenges: z.array(z.string()),
})

export const parseOpponents = (raw: string): Opponent[] =>
  OppositionArtifactSchema.parse(JSON.parse(raw)).opponents.map((o) => ({
    fullName: o.full_name,
    partyAffiliation: o.party_affiliation || 'Unknown',
    incumbent: o.incumbent,
  }))

export const parseOpportunitiesAndChallenges = (
  raw: string,
): { opportunities: string[]; challenges: string[] } =>
  OpportunitiesChallengesArtifactSchema.parse(JSON.parse(raw))
