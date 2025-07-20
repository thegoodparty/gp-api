import { z } from 'zod'

export function makeOptional<T>(schema: z.ZodType<T>) {
  return z.union([z.null(), z.undefined(), z.literal(''), schema])
}

/**
 * Zod helper function to parse a JSON string to an object before validating with a schema
 * @param schema Zod schema to validate the parsed object with
 * @param errorMessage Message to add to the Zod errors if the JSON.parse fails
 */
export function parseJsonString<T>(
  schema: z.ZodType<T>,
  errorMessage?: string,
) {
  return z.preprocess((input, ctx) => {
    if (input === undefined) return

    try {
      return JSON.parse(input as string)
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: errorMessage ?? 'Must be a valid JSON string',
      })
    }
  }, schema)
}
