import { STATES, STATE_CODES } from '../constants/states'
import { z } from 'zod'

/**
 * State validation function intended to be used in a zod schema
 * @example
 * const schema = z.object({
 *   name: z.string().optional(),
 *   state: isState().optional() /// etc
 * })
 */
export function isState(stateLength: 'long' | 'short' = 'short') {
  return z.string().refine(
    (value) => {
      const input = value.toLowerCase()

      return (stateLength === 'short' ? STATE_CODES : STATES).some(
        (state) => state.toLowerCase() === input,
      )
    },
    { message: 'Must be a valid state' },
  )
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
