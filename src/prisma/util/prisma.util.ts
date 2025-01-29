import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { Prisma, PrismaClient } from '@prisma/client'
import { lowerFirst } from 'lodash'

export const MODELS = Prisma.ModelName

type ExcludeTypes = `$${string}` | symbol
type PrismaModels = Exclude<keyof PrismaClient, ExcludeTypes>
type PrismaMethods = Exclude<keyof PrismaClient[PrismaModels], ExcludeTypes>

// These are methods that should be avaialable as public methods on any prisma model service
// e.g. this.campaignsService.findMany(...args)
// this allows to avoid manually redeclaring types when we just want to make a prisma method available directly
const PASSTHROUGH_MODEL_METHODS = [
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
] satisfies PrismaMethods[]

export function createPrismaBase<T extends Prisma.ModelName>(modelName: T) {
  const lowerModelName = lowerFirst(modelName)
  /* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
  @Injectable()
  class BasePrismaService implements OnModuleInit {
    @Inject()
    // NOTE: TS won't let me make this private when returning a class def from a function
    readonly _prisma!: PrismaService

    readonly logger = new Logger(this.constructor.name)

    get model(): PrismaClient[Uncapitalize<T>] {
      return this._prisma[lowerModelName]
    }

    get client(): PrismaClient {
      return this._prisma
    }

    onModuleInit() {
      // Have to do these in onModuleInit, client is not available at constructor
      for (const method of PASSTHROUGH_MODEL_METHODS) {
        this[method] = this.model[method].bind(this.model)
      }
    }
  }

  // This interface merges with the class type to apply the prisma method types to the class def
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface BasePrismaService
    extends Pick<
      PrismaClient[Uncapitalize<T>],
      (typeof PASSTHROUGH_MODEL_METHODS)[number]
    > {}
  /* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

  return BasePrismaService
}
