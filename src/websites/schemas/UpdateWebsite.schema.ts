import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class UpdateWebsiteSchema extends createZodDto(
  z.object({
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
      })
      .optional(),
    contact: z
      .object({
        address: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
      })
      .optional(),
  }),
) {}
