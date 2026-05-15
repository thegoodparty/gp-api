import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

export const isPrismaError = (err: unknown, code: string): boolean =>
  err instanceof PrismaClientKnownRequestError && err.code === code

export const isUniqueConstraintError = (err: unknown): boolean =>
  isPrismaError(err, 'P2002')
