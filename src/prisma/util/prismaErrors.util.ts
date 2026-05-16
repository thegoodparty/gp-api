import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

// Note: a plain `instanceof PrismaClientKnownRequestError` check is unreliable
// in tests/CI because the Prisma runtime can be loaded from more than one path
// (e.g. dual ESM/CJS resolution), giving two distinct constructor identities.
// We treat any error whose constructor name + numeric `code` match as a
// Prisma known-request error.
export const isPrismaError = (err: unknown, code: string): boolean => {
  if (err instanceof PrismaClientKnownRequestError && err.code === code) {
    return true
  }
  if (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'PrismaClientKnownRequestError' &&
    (err as { code?: unknown }).code === code
  ) {
    return true
  }
  return false
}

export const isUniqueConstraintError = (err: unknown): boolean =>
  isPrismaError(err, 'P2002')
