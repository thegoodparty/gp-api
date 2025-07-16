import { z } from 'zod'

// Regular expression for US ZIP code validation from Grok
//  https://grok.com/share/bGVnYWN5_076c8b2e-995b-48f0-8829-200c713bd95a
const US_ZIP_CODE_PATTERN = /^\d{5}(?:[- ]\d{4})?$/

export const PostalAddressSchema = z.object({
  postalCode: z.string().regex(US_ZIP_CODE_PATTERN),
  state: z.string().max(2),
  city: z.string(),
  streetLines: z.array(z.string()),
})
