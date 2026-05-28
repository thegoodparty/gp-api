import { DomainStatus, WebsiteStatus } from '@prisma/client'
import { z } from 'zod'
import { GooglePlacesApiResponseSchema } from 'src/shared/schemas'

const WebsiteContentSchema = z
  .object({
    logo: z.string().optional(),
    theme: z.string().optional(),
    main: z
      .object({
        title: z.string().optional(),
        tagline: z.string().optional(),
        image: z.string().optional(),
      })
      .optional(),
    about: z
      .object({
        bio: z.string().optional(),
        issues: z
          .array(
            z.object({
              title: z.string().optional(),
              description: z.string().optional(),
            }),
          )
          .optional(),
        committee: z.string().optional(),
      })
      .optional(),
    contact: z
      .object({
        address: z.string().optional(),
        addressPlace: GooglePlacesApiResponseSchema.optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
      })
      .optional(),
  })
  .nullable()

const DomainSchema = z
  .object({
    id: z.number().int(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    name: z.string(),
    websiteId: z.number().int(),
    status: z.nativeEnum(DomainStatus),
    operationId: z.string().nullable(),
    price: z.number().nullable(),
    paymentId: z.string().nullable(),
    emailForwardingDomainId: z.string().nullable(),
    registrantVerifiedAt: z.coerce.date().nullable(),
  })
  .nullable()

export const MyWebsiteResponseSchema = z.object({
  id: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  campaignId: z.number().int(),
  status: z.nativeEnum(WebsiteStatus),
  hasEverBeenPublished: z.boolean(),
  vanityPath: z.string(),
  content: WebsiteContentSchema,
  domain: DomainSchema,
})
