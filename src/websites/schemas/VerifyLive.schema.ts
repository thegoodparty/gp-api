import { z } from 'zod'

export const VerifyLiveResponseSchema = z.object({
  verified: z.boolean(),
  url: z.string().url(),
  checks: z.object({
    http_200: z.boolean(),
    has_privacy_policy: z.boolean(),
    has_terms: z.boolean(),
    has_candidate_identity: z.boolean(),
  }),
})

export type VerifyLiveResponse = z.infer<typeof VerifyLiveResponseSchema>
