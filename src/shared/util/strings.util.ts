import { randomBytes } from 'crypto'
import { getRandomInt } from './numbers.util'

export const trimMany = (strings: {
  [key: string]: string
}): { [key: string]: string } =>
  Object.entries(strings).reduce(
    (acc, [key, value = '']) => ({
      ...acc,
      [key]: value.trim(),
    }),
    {},
  )

export const toLowerAndTrim = (str: string = '') => str.trim().toLowerCase()

const MAX_STRING_LENGTH = Number(process.env.MAX_STRING_LENGTH || 2048)
const CHARSET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()'
export const generateRandomString = (
  minlength = 1,
  maxLength: number = MAX_STRING_LENGTH,
) =>
  [
    ...randomBytes(
      getRandomInt(
        minlength,
        maxLength > MAX_STRING_LENGTH ? MAX_STRING_LENGTH : maxLength,
      ),
    ),
  ]
    .map((b) => CHARSET[b % CHARSET.length])
    .join('')
