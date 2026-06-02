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

// Terminal failure: at least one CAP run failed. We do NOT retry — the client
// shows an error rather than polling forever.
export const StrategicLandscapeFailedSchema = z.object({
  status: z.literal('failed'),
})

export const StrategicLandscapeResponseSchema = z.discriminatedUnion('status', [
  StrategicLandscapeReadySchema,
  StrategicLandscapeGeneratingSchema,
  StrategicLandscapeFailedSchema,
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

// Non-empty bullets only; clamp to the contract's max of 3 so a misbehaving
// experiment that emits 4+ can't persist a set that then fails the
// StrategicLandscapeResultSchema (.max(3)) on every read.
const MAX_BULLETS = 3
const OpportunitiesChallengesArtifactSchema = z.object({
  opportunities: z
    .array(z.string().min(1))
    .min(1)
    .transform((a) => a.slice(0, MAX_BULLETS)),
  challenges: z
    .array(z.string().min(1))
    .min(1)
    .transform((a) => a.slice(0, MAX_BULLETS)),
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
