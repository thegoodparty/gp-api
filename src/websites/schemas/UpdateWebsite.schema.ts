import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const UpdateWebsiteSchema = createZodDto(
  z.object({
    hero: z
      .object({
        title: z.string(),
        tagline: z.string(),
        logo: z.string(),
        callToAction: z.string(),
        ctaLink: z.string(),
        heroImage: z.string(),
      })
      .optional(),
    about: z
      .object({
        bio: z.string(),
        keyIssues: z.array(
          z.object({
            title: z.string(),
            description: z.string(),
          }),
        ),
      })
      .optional(),
    getInvolved: z
      .object({
        description: z.string(),
        volunteer: z.object({
          title: z.string(),
          description: z.string(),
          callToAction: z.string(),
          ctaLink: z.string(),
        }),
        donate: z.object({
          title: z.string(),
          description: z.string(),
          callToAction: z.string(),
          ctaLink: z.string(),
        }),
        subscribe: z.object({
          title: z.string(),
          description: z.string(),
          callToAction: z.string(),
          ctaLink: z.string(),
        }),
      })
      .optional(),
    contact: z
      .object({
        title: z.string(),
        description: z.string(),
        address: z.string(),
        email: z.string(),
        phone: z.string(),
      })
      .optional(),
    privacy: z
      .object({
        showLink: z.boolean().optional(),
      })
      .optional(),
  }),
)
