import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/client'
import { PrismaService } from './prisma.service'

type PrismaModelNames = Prisma.TypeMap['meta']['modelProps']
type PrismaMethodNames = {
  [M in PrismaModelNames]: keyof Prisma.TypeMap['model'][Capitalize<M>]['operations']
}[PrismaModelNames]

// list of prisma client methods to make available as public methods on the service class
const PASSTHROUGH_METHODS = [
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
] satisfies PrismaMethodNames[]

/**
 * Base class for reusable funcitonality across Prisma model services
 * @example
 * class CampaignsService extends BasePrismaService<'campaigns'> {
 *   constructor(...injectedStuff) {
 *     super('campaigns')
 *   }
 * }
 */
@Injectable()
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class BasePrismaService<T extends PrismaModelNames>
  implements OnModuleInit
{
  @Inject(PrismaService)
  private readonly _prisma!: PrismaService

  protected readonly logger = new Logger(this.constructor.name)

  protected constructor(protected readonly modelName: T) {}

  protected get model(): PrismaClient[T] {
    // allows child class to use only their specified model
    return this._prisma[this.modelName]
  }

  onModuleInit() {
    // make PASSTHROUGH_METHODS directly available on child class as public methods
    for (const method of PASSTHROUGH_METHODS) {
      this[method] = this.model[method].bind(this.model)
    }
  }
}

// This interface merges with the above class declaration,
// to make the above PASSTHROUGH_METHODS types available
// actual methods will be added at runtime in onModuleInit
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BasePrismaService<T extends PrismaModelNames>
  extends Pick<PrismaClient[T], (typeof PASSTHROUGH_METHODS)[number]> {}
