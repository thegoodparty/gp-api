import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/client'
import { Client } from 'pg'
import { createModelEventTrigger, RowChangeEvent } from './model-events'
import { EventEmitter } from 'node:events'

const PRISMA_LOG_LEVELS = [
  'info',
  'warn',
  'error',
  ...(process.env.LOG_LEVEL === 'debug' ? ['query' as Prisma.LogLevel] : []),
]

const enableQueryLogging = Boolean(process.env.ENABLE_QUERY_LOGGING === 'true')

const getTableName = (
  client: PrismaClient,
  modelName: Prisma.ModelName,
): string => {
  // @ts-expect-error not on the TS types, but it's there.
  return client._runtimeDataModel.models[modelName].dbName
}

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query'>
  implements OnModuleInit, OnModuleDestroy
{
  private logger = new Logger(PrismaService.name)
  private pgClient = new Client({
    // TODO: clean up this database url
    connectionString: process.env.DATABASE_URL,
  })

  private readonly rowChangeEmitter = new EventEmitter<{
    update: [RowChangeEvent<Prisma.ModelName>]
  }>()

  constructor() {
    super({
      log: PRISMA_LOG_LEVELS.map((level) => ({
        emit: 'event',
        level: level as Prisma.LogLevel,
      })),
      errorFormat: 'pretty',
    })
  }

  subscribeToRowChanges<ModelName extends Prisma.ModelName>(
    modelName: ModelName,
    listener: (event: RowChangeEvent<ModelName>) => void | Promise<void>,
  ) {
    this.rowChangeEmitter.on('update', async (update) => {
      if (getTableName(this, modelName) === update.table) {
        // TODO: retry, and handle errors
        await listener(update)
      }
    })
  }

  async onModuleInit() {
    await this.$connect()

    enableQueryLogging &&
      this.$on('query', (event: Prisma.QueryEvent) => {
        this.logger.debug(
          {
            query: event.query,
            params: event.params,
            durationMs: event.duration,
          },
          'Completed SQL Query',
        )
      })

    await this.pgClient.connect()

    this.pgClient.on('notification', async (msg) => {
      if (!msg.payload) {
        return
      }
      const payload = JSON.parse(
        msg.payload,
      ) as RowChangeEvent<Prisma.ModelName>

      this.rowChangeEmitter.emit('update', payload)
    })

    await createModelEventTrigger(
      this.logger,
      this.pgClient,
      Object.values(Prisma.ModelName).map((modelName) =>
        getTableName(this, modelName),
      ),
    )

    this.logger.log('Listening for row changes')
  }

  async onModuleDestroy() {
    await this.$disconnect()
    await this.pgClient.end()
  }
}
