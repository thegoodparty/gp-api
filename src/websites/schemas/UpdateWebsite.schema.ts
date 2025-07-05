import { WebsiteStatus } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class UpdateWebsiteSchema extends createZodDto(
  z.object({
    status: z.nativeEnum(WebsiteStatus).optional(),
    vanityPath: z
      .string()
      .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
        message:
          'Vanity path must contain only lowercase letters, numbers, and hyphens. It cannot start or end with a hyphen.',
      })
      .transform((val) => val?.toLowerCase())
      .optional(),
    theme: z.string().optional(),
    main: z
      .object({
        title: z.string().optional(),
        tagline: z.string().optional(),
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
