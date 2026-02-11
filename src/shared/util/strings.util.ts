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

export function camelToSentence(text: string) {
  const result = text.replace(/([A-Z])/g, ' $1')
  return result.charAt(0).toUpperCase() + result.slice(1)
}

export function capitalizeFirstLetter(str: string): string {
  if (!str || str.length < 2) return str

  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}
export const getUrlProtocol = (url: string) => {
  const result = url.match(/^https?:\/\//i) // Check if URL is already prefixed with http(s), case-insensitive
  return result?.[0]?.toLowerCase()
}

export const ensureUrlHasProtocol = (url: string) =>
  getUrlProtocol(url) ? url : `https://${url}`

export const urlIncludesPath = (urlStr: string): boolean =>
  // optional protocol, but must have path (e.g. http://example.com/path not just http://example.com)
  /^(https?:\/\/)?[^\/\s]+\/[^\/\s]+.*$/i.test(urlStr)

/** Coerce CSV-style string to boolean (true for 'true', '1', 'yes' case-insensitive) */
export function toBoolean(s: string | undefined): boolean {
  if (s == null || s === '') return false
  const lower = s.toLowerCase()
  return lower === 'true' || lower === '1' || lower === 'yes'
}
