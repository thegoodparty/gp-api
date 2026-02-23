import { z } from 'zod'

export const WHY_BROWSING_VALUES = [
  'considering',
  'learning',
  'test',
  'else',
] as const

export type WhyBrowsing = (typeof WHY_BROWSING_VALUES)[number]

export const WhyBrowsingSchema = z.enum(WHY_BROWSING_VALUES)

export const UserMetaDataObjectSchema = z.object({
  customerId: z.string().optional(),
  checkoutSessionId: z.string().nullish(),
  accountType: z.string().nullish(),
  lastVisited: z.number().optional(),
  sessionCount: z.number().optional(),
  isDeleted: z.boolean().optional(),
  fsUserId: z.string().optional(),
  whyBrowsing: WhyBrowsingSchema.nullish(),
  hubspotId: z.string().optional(),
  profile_updated_count: z.number().optional(),
  textNotifications: z.boolean().optional(),
})

export const UserMetaDataSchema = UserMetaDataObjectSchema.nullish()
