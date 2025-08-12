import { WebsiteStatus } from '@prisma/client'
import { VanityPathSchema } from './VanityPath.schema'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { GooglePlacesApiResponseSchema } from 'src/shared/schemas'

export class UpdateWebsiteSchema extends createZodDto(
  z.object({
    logo: z.string().optional(),
    status: z.nativeEnum(WebsiteStatus).optional(),
    vanityPath: VanityPathSchema.optional(),
    theme: z.string().optional(),
    createStep: z.coerce.string().optional(),
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
  }),
) {}
