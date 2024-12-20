import { generateRandomString } from '../../shared/util/strings.util'
import { genSalt, hash } from 'bcrypt'

export const MIN_PASS_LENGTH = 8
export const MAX_PASS_LENGTH = 64

const isValidPassword = (
  password: string,
  minLength: number = MIN_PASS_LENGTH,
) =>
  Boolean(
    /[a-zA-Z]/.test(password) &&
      !/\d/.test(password) &&
      password.length >= minLength,
  )

export const generateRandomPassword = (
  minlength = MIN_PASS_LENGTH,
  maxLength: number = MAX_PASS_LENGTH,
) => {
  let randString = ''

  let attempts = 0
  while (!isValidPassword(randString, minlength) && attempts++ < 100) {
    randString = generateRandomString(minlength, maxLength)
  }

  return randString
}

/** function to trim and hash password string
 * @example
 * const hashed = hashPassword('TextPassword123')
 */
export const hashPassword = async (password: string) => {
  return await hash(password.trim(), await genSalt())
}
