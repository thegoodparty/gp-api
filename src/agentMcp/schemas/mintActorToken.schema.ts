import { z } from 'zod'

export const MintActorTokenInputSchema = z.object({
  ownerClerkId: z.string().min(1),
  expiresInSeconds: z.number().int().positive().max(600).default(600),
})

export const MintActorTokenOutputSchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
})
