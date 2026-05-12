import { z } from 'zod'

export const OrganizationSchema = z.object({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  slug: z.string(),
  ownerId: z.number(),
  positionId: z.string().nullable(),
  overrideDistrictId: z.string().nullable(),
  customPositionName: z.string().nullable(),
})

export type Organization = z.infer<typeof OrganizationSchema>
