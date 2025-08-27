import { z } from 'zod'

/**
 * Base schema containing all voter filter fields used across different contexts
 * (VoterFileFilter creation, P2P phone lists, etc.)
 */
export const voterFilterBaseSchema = z.object({
  audienceSuperVoters: z.boolean().optional(),
  audienceLikelyVoters: z.boolean().optional(),
  audienceUnreliableVoters: z.boolean().optional(),
  audienceUnlikelyVoters: z.boolean().optional(),
  audienceFirstTimeVoters: z.boolean().optional(),
  partyIndependent: z.boolean().optional(),
  partyDemocrat: z.boolean().optional(),
  partyRepublican: z.boolean().optional(),
  age18_25: z.boolean().optional(),
  age25_35: z.boolean().optional(),
  age35_50: z.boolean().optional(),
  age50Plus: z.boolean().optional(),
  genderMale: z.boolean().optional(),
  genderFemale: z.boolean().optional(),
})
