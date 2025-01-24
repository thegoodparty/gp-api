import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { PrismaService } from './prisma.service'
import {
  PrismaModelMethods,
  PrismaClientMethods,
  PrismaModelNames,
} from './prisma.types'

// list of Prisma model methods to make available as public methods on the child class
const PASSTHROUGH_MODEL_METHODS = [
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
] satisfies PrismaModelMethods[]

// List of PrismaClient methods to make available to child class
const ALLOWED_CLIENT_METHODS = [
  '$transaction',
  '$queryRaw',
  // TODO: add any more we might need
] satisfies PrismaClientMethods[]

type AllowedClientMethods = (typeof ALLOWED_CLIENT_METHODS)[number]
type ProxyClient = Pick<PrismaClient, AllowedClientMethods>

/**
 * Base class for reusable funcitonality across Prisma services
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
  protected readonly logger = new Logger(this.constructor.name)

  // inject prisma service via param injection, so child does not have direct access
  @Inject(PrismaService)
  private readonly _prisma!: PrismaService
  protected get model(): PrismaClient[T] {
    return this._prisma[this.modelName]
  }

  private _proxyClient!: ProxyClient
  protected get client() {
    return this._proxyClient
  }

  // child class specifies prisma model to use
  protected constructor(protected readonly modelName: T) {}

  onModuleInit() {
    // Have to do these in onModuleInit, client is not available at constructor
    // make PASSTHROUGH_MODEL_METHODS directly available on child class as public methods
    for (const method of PASSTHROUGH_MODEL_METHODS) {
      this[method] = this.model[method].bind(this.model)
    }

    this._proxyClient = this.getClientProxy()
  }

  private getClientProxy() {
    return new Proxy(this._prisma, {
      get(target, prop, _receiver) {
        if (typeof prop === 'string' && prop in target) {
          // Allow only explicitly exposed methods
          if (ALLOWED_CLIENT_METHODS.includes(prop as AllowedClientMethods)) {
            // Preserve function binding and type safety
            const method = target[prop]
            if (typeof method === 'function') {
              return method.bind(target)
            }
          }
        }
        throw new Error(`Access denied to method: ${String(prop)}`)
      },
    }) as ProxyClient
  }
}

// This interface merges with the above class declaration,
// to make the above PASSTHROUGH_MODEL_METHODS types available
// actual methods will be added at runtime in onModuleInit
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BasePrismaService<T extends PrismaModelNames>
  extends Pick<PrismaClient[T], (typeof PASSTHROUGH_MODEL_METHODS)[number]> {}
