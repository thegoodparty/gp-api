import { GOOGLE_ADDRESS_PLACE_VALUES } from 'src/shared/types/GooglePlaces.types'
import { z } from 'zod'

export const GoogleAddressComponentSchema = z.object({
  long_name: z.string(),
  short_name: z.string(),
  types: z.array(z.enum(GOOGLE_ADDRESS_PLACE_VALUES)),
})

export const GooglePlaceGeometrySchema = z.object({
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

export const GooglePlusCodeSchema = z.object({
  compound_code: z.string(),
  global_code: z.string(),
})

export const GooglePlacesApiResponseSchema = z.object({
  address_components: z.array(GoogleAddressComponentSchema),
  adr_address: z.string().optional(),
  formatted_address: z.string().optional(),
  geometry: GooglePlaceGeometrySchema.optional(),
  icon: z.string().optional(),
  icon_background_color: z.string().optional(),
  icon_mask_base_uri: z.string().optional(),
  name: z.string().optional(),
  place_id: z.string().optional(),
  plus_code: GooglePlusCodeSchema.optional(),
  reference: z.string().optional(),
  types: z.array(z.enum(GOOGLE_ADDRESS_PLACE_VALUES)).optional(),
  url: z.string().optional(),
  utc_offset: z.union([z.number(), z.string()]).optional(),
  vicinity: z.string().optional(),
  html_attributions: z.array(z.string()).optional(),
  utc_offset_minutes: z.union([z.number(), z.string()]).optional(),
})
