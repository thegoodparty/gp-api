import { retryIf } from '@/shared/util/retry-if'
import {
  BadRequestException,
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
          // WHY WE NEED A TYPED INTERFACE:
          // Prisma's type system represents model delegates as union types (one per model).
          // TypeScript cannot call methods on union types because each model has different method signatures.
          // We create a minimal interface with just the methods we need, which TypeScript can work with.
          //
          // WHY THIS IS SAFE AT RUNTIME:
          // 1. At runtime, `this.model` is guaranteed to be the correct delegate for model `T`
          //    (it's created by Prisma based on the model name)
          // 2. The generic `T` constrains which model we're working with at compile time
          // 3. We're only using methods (`findUnique`, `updateManyAndReturn`) that exist on all Prisma model delegates
          // 4. The interface we're casting to matches the actual runtime structure of the model delegate
          // 5. This is a type system limitation workaround, not a runtime behavior change
          type ModelWithMethods = {
            findUnique: (args: {
              where: UniqueWhereArg
            }) => Promise<ExistingRecord | null>
            updateManyAndReturn: (
              args: UpdateManyAndReturnArgs,
            ) => Promise<ExistingRecord[]>
          }
          // WHY `as unknown as` IS SAFE:
          // The double assertion pattern (`as unknown as TargetType`) is necessary because:
          // 1. TypeScript's type system is structural, but Prisma's union types are too complex for direct casting
          // 2. `as unknown` first erases the type information, allowing us to bypass TypeScript's strict checks
          // 3. `as ModelWithMethods` then tells TypeScript what we know to be true at runtime
          //
          const model = this.model as unknown as ModelWithMethods

          // Type assertion is safe: findUnique returns the correct record type for model T.
          // The union type prevents direct method calls, but we know the runtime type is correct.
          const existing = await model.findUnique({
            where: params.where,
          })

          if (!existing) {
            const msg = `[optimistic locking update] Existing ${modelName} record not found for where clause: ${JSON.stringify(params.where)}`
            this.logger.log(msg)
            throw new NotFoundException(msg)
          }

          // Runtime validation: ensure the model has the required `updatedAt` timestamp column.
          // This check validates at runtime what TypeScript cannot guarantee at compile time
          // (since Prisma's types don't enforce the presence of `updatedAt` on all models).
          if (
            !('updatedAt' in existing) ||
            !(existing.updatedAt instanceof Date)
          ) {
            const msg = `[optimistic locking update] Model ${modelName} does not have an 'updatedAt' timestamp column, which is required for optimistic locking`
            this.logger.error(msg)
            throw new BadRequestException(msg)
          }

          const patch = await modification(existing)

          // Type assertion is safe: we've validated at runtime that `updatedAt` exists and is a Date.
          // This assertion allows TypeScript to understand the type for the rest of the method.
          const existingWithUpdatedAt = existing as ExistingRecord & {
            updatedAt: Date
          }

          // WHY THE TYPE ASSERTIONS:
          // Prisma's `updateManyAndReturn` expects very specific types that TypeScript can't infer
          // from the union type. We assert the types we know are correct:
          // - `where`: We're using the same `UniqueWhereArg` type from findUnique, plus updatedAt
          // - `data`: The patch comes from the modification function which returns Partial<ExistingRecord>
          // - The whole args object: Prisma's union types require this final assertion
          //
          // WHY THIS IS SAFE:
          // All these types are derived from the same `ModelDelegate` and `ExistingRecord` types,
          // so they're guaranteed to be compatible at runtime.
          const result = await model.updateManyAndReturn({
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
