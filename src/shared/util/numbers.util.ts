import { faker } from '@faker-js/faker'

export const LARGEST_SAFE_INTEGER = 2 ** 31 - 1
export const getRandomInt = (min: number, max: number = LARGEST_SAFE_INTEGER) =>
  Math.floor(Math.random() * ((max === 0 || max ? max - min : min) + 1)) + min

export const getRandomPercentage = () =>
  faker.number.float({ min: 0, max: 100, fractionDigits: 2 })
