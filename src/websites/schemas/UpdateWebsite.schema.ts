import { WebsiteStatus } from '@prisma/client'
import { VanityPathSchema } from './VanityPath.schema'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { GOOGLE_ADDRESS_PLACE_VALUES } from 'prisma/schema/website.jsonTypes'

const GoogleAddressComponentSchema = z.object({
  long_name: z.string(),
  short_name: z.string(),
  types: z.array(z.enum(GOOGLE_ADDRESS_PLACE_VALUES)),
})

const GooglePlaceGeometrySchema = z.object({
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  viewport: z
    .object({
      south: z.number().optional(),
      west: z.number().optional(),
      north: z.number().optional(),
      east: z.number().optional(),
    })
    .optional(),
})

const GooglePlusCodeSchema = z.object({
  compound_code: z.string(),
  global_code: z.string(),
})

const GooglePlacesApiResponseSchema = z.object({
  address_components: z.array(GoogleAddressComponentSchema),
  adr_address: z.string(),
  formatted_address: z.string(),
  geometry: GooglePlaceGeometrySchema.optional(),
  icon: z.string().optional(),
  icon_background_color: z.string().optional(),
  icon_mask_base_uri: z.string().optional(),
  name: z.string(),
  place_id: z.string(),
  plus_code: GooglePlusCodeSchema.optional(),
  reference: z.string().optional(),
  types: z.array(z.enum(GOOGLE_ADDRESS_PLACE_VALUES)),
  url: z.string().optional(),
  utc_offset: z.union([z.number(), z.string()]).optional(),
  vicinity: z.string().optional(),
  html_attributions: z.array(z.string()).optional(),
  utc_offset_minutes: z.union([z.number(), z.string()]).optional(),
})

export class UpdateWebsiteSchema extends createZodDto(
  z.object({
    logo: z.string().optional(),
    status: z.nativeEnum(WebsiteStatus).optional(),
    vanityPath: VanityPathSchema.optional(),
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
  }),
) {}
