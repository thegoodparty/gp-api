import { Prisma } from '@prisma/client'

type UserJsonFields = {
  metaData?: Prisma.JsonObject
}

export type UserWhereInputWithJsonFields = Prisma.UserWhereInput &
  UserJsonFields

export type UserWhereUniqueInputWithJsonFields = Prisma.UserWhereUniqueInput &
  UserJsonFields
