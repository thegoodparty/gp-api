import { z } from 'zod'
import { STATE_CODES, STATES } from '../constants/states'

export function StateSchema(stateLength: 'long' | 'short' = 'short') {
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
