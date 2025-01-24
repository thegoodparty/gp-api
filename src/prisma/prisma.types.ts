import { Prisma, PrismaClient } from '@prisma/client'

export type PrismaModelNames = Prisma.TypeMap['meta']['modelProps']

export type PrismaModelMethods = {
  [M in PrismaModelNames]: keyof Prisma.TypeMap['model'][Capitalize<M>]['operations']
}[PrismaModelNames]

export type PrismaClientMethods = Extract<keyof PrismaClient, `$${string}`>
