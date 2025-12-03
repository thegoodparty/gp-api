import { retryIf } from '@/shared/util/retry-if'
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/client'
import { lowerFirst } from 'lodash'
import { PrismaService } from '../prisma.service'

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

  type ModelDelegate = PrismaClient[Uncapitalize<T>]
  type UniqueWhereArg = Parameters<ModelDelegate['findUnique']>[0]['where']

  type ExistingRecord = Awaited<ReturnType<ModelDelegate['findUniqueOrThrow']>>

  type UpdateManyAndReturnArgs = Parameters<
    ModelDelegate['updateManyAndReturn']
  >[0]

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
        const thisWithMethod: Record<string, (...args: unknown[]) => unknown> =
          this as unknown as Record<string, (...args: unknown[]) => unknown>
        thisWithMethod[method] = this.model[method].bind(this.model) as (
          ...args: unknown[]
        ) => unknown
      }
    }

    /**
     * Performs an optimistic locking update on a Prisma model record using the `updatedAt` timestamp
     * to detect concurrent updates.
     *
     * For more information about optimistic locking, check out this article:
     * https://en.wikipedia.org/wiki/Optimistic_concurrency_control
     *
     * @example
     * ```typescript
     * // Update a user's balance atomically
     * const updatedUser = await this.optimisticLockingUpdate(
     *   { where: { id: userId } },
     *   (existing) => ({
     *     balance: existing.balance + amount,
     *   })
     * );
     * ```
     */
    optimisticLockingUpdate(
      params: { where: UniqueWhereArg },
      modification: (
        existing: ExistingRecord,
      ) => Partial<ExistingRecord> | Promise<Partial<ExistingRecord>>,
    ): Promise<ExistingRecord> {
      return retryIf<ExistingRecord>(
        async (_, attempt): Promise<ExistingRecord> => {
          type FindUniqueResult = Awaited<
            ReturnType<ModelDelegate['findUnique']>
          >
          type TypedModelDelegate = {
            findUnique: (args: {
              where: UniqueWhereArg
            }) => Promise<FindUniqueResult>
            updateManyAndReturn: (
              args: UpdateManyAndReturnArgs,
            ) => Promise<ExistingRecord[]>
          }

          const modelDelegate = this.model as unknown as TypedModelDelegate

          const existing = await modelDelegate.findUnique({
            where: params.where,
          })

          if (!existing) {
            const msg = `[optimistic locking update] Existing ${modelName} record not found for where clause: ${JSON.stringify(params.where)}`
            this.logger.log(msg)
            throw new NotFoundException(msg)
          }

          const patch = await modification(existing)

          const existingWithUpdatedAt = existing as ExistingRecord & {
            updatedAt: Date
          }

          const result = await modelDelegate.updateManyAndReturn({
            where: {
              AND: [
                params.where,
                { updatedAt: existingWithUpdatedAt.updatedAt },
              ],
            } as UpdateManyAndReturnArgs['where'],
            data: patch as UpdateManyAndReturnArgs['data'],
          } as UpdateManyAndReturnArgs)

          if (result.length === 0) {
            const msg = `[optimistic locking update] Record has been modified since it was fetched for where clause: ${JSON.stringify(params.where)} attempt ${attempt}`
            this.logger.log(msg)
            throw new ConflictException(msg)
          }

          return result[0]
        },
        {
          shouldRetry: (error) => error instanceof ConflictException,
          retries: 5,
          factor: 1.5,
          minTimeout: 100,
        },
      )
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
