import { faker } from '@faker-js/faker'

export const LARGEST_SAFE_INTEGER = 2 ** 31 - 1
export const getRandomInt = (min: number, max: number = LARGEST_SAFE_INTEGER) =>
  Math.floor(Math.random() * ((max === 0 || max ? max - min : min) + 1)) + min

export const getRandomPercentage = () =>
  faker.number.float({ min: 0, max: 100, fractionDigits: 2 })

export const getRandomElementFromArray = (array: any[]) =>
  array[getRandomInt(0, array.length - 1)]

/**
 * Formats a phone number for AWS Route53 domain registration
 * @param phoneNumber - The phone number to format
 * @param fallbackNumber - Optional fallback number to use if phoneNumber is invalid
 * @returns Properly formatted phone number in +1.XXXXXXXXXX format
 */
export const formatPhoneNumber = (
  phoneNumber?: string,
  fallbackNumber?: string,
): string => {
  if (!phoneNumber || phoneNumber.trim() === '') {
    if (fallbackNumber) {
      return fallbackNumber
    }
    throw new Error('No phone number provided and no fallback available')
  }

  const cleanedNumber = phoneNumber.replace(/\D/g, '')

  if (cleanedNumber === '') {
    if (fallbackNumber) {
      return fallbackNumber
    }
    throw new Error('Invalid phone number format and no fallback available')
  }

  if (cleanedNumber.length === 10) {
    return `+1.${cleanedNumber}`
  } else if (cleanedNumber.length === 11 && cleanedNumber.startsWith('1')) {
    return `+1.${cleanedNumber.substring(1)}`
  } else if (cleanedNumber.length > 11) {
    if (
      cleanedNumber.startsWith('1') &&
      cleanedNumber.substring(1).length === 10
    ) {
      return `+1.${cleanedNumber.substring(1)}`
    } else {
      // Non-US number or invalid format, use fallback
      if (fallbackNumber) {
        return fallbackNumber
      }
      throw new Error('Non-US phone number and no fallback available')
    }
  } else {
    // Invalid length, use fallback
    if (fallbackNumber) {
      return fallbackNumber
    }
    throw new Error('Invalid phone number length and no fallback available')
  }
}
