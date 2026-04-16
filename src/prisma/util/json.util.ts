import { Prisma } from '@prisma/client'

// Prisma doesn't support case insensitive json field filters yet
export function caseInsensitiveCompare(
  key: string,
  path: string[],
  value: string,
  method: keyof Prisma.JsonFilter = 'equals',
) {
  return {
    OR: [
      {
        [key]: {
          path,
          [method]: value,
        },
      },
      {
        // all uppercase
        [key]: {
          path,
          [method]: value.toUpperCase(),
        },
      },
      {
        // all lowercase
        [key]: {
          path,
          [method]: value.toLowerCase(),
        },
      },
      {
        // Capitalized
        [key]: {
          path,
          [method]: `${value[0].toUpperCase()}${value.slice(1)}`,
        },
      },
    ],
  }
}
