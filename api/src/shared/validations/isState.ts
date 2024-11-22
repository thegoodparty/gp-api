import { STATES, STATE_CODES } from '../constants/states'
import { z } from 'zod'

/**
 * Validaiton function intended to be used in a zod schema
 * @example
 * const schema = z.object({
 *   name: z.string().optional(),
 *   state: isState().optional() /// etc
 * })
 */
export function isState(stateLength: 'long' | 'short' = 'short') {
  return z.string().refine(
    (value: any) => {
      const input = String(value).toLowerCase()

      return (stateLength === 'short' ? STATE_CODES : STATES).some(
        (state) => state.toLowerCase() === input,
      )
    },
    { message: 'Must be a valid state' },
  )
}
