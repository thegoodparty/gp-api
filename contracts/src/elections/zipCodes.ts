import { z } from 'zod'

export const ZipCodesArraySchema = z.array(z.string())
