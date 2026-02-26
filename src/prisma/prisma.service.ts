import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/client'

const PRISMA_LOG_LEVELS = [
  'info',
  'warn',
  'error',
  ...(process.env.LOG_LEVEL === 'debug' ? ['query' as Prisma.LogLevel] : []),
]

const enableQueryLogging = Boolean(process.env.ENABLE_QUERY_LOGGING === 'true')

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query'>
  implements OnModuleInit, OnModuleDestroy
{
  private logger = new Logger(PrismaService.name)

  constructor() {
    super({
      log: PRISMA_LOG_LEVELS.map((level) => ({
        emit: 'event',
        level: level as Prisma.LogLevel,
      })),
      errorFormat: 'pretty',
    })
  }

  async onModuleInit() {
    await this.$connect()

    enableQueryLogging &&
      this.$on('query', (event: Prisma.QueryEvent) => {
        // this.logger.debug(
        //   {
        //     query: event.query,
        //     params: event.params,
        //     durationMs: event.duration,
        //   },
        //   'Completed SQL Query',
        // )
      })
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
