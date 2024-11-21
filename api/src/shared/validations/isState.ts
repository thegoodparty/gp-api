import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator'

import { STATES, STATE_CODES } from '../constants/states'

export function IsState(
  stateLength: 'short' | 'long' = 'short',
  validationOptions?: ValidationOptions,
) {
  return function (obj: object, propertyName: string) {
    registerDecorator({
      name: 'IsState',
      target: obj.constructor,
      propertyName,
      constraints: [stateLength],
      options: {
        message: `Must be a valid state ${stateLength === 'short' ? 'code' : ''}`,
        ...validationOptions,
      },
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [stateLength] = args.constraints
          const input = String(value).toLowerCase()

          const compareFn = (state) => state.toLowerCase() === input

          if (stateLength === 'short') {
            return STATE_CODES.some(compareFn)
          } else {
            return STATES.some(compareFn)
          }
        },
      },
    })
  }
}
