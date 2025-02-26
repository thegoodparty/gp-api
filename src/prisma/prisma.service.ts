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

    this.$on('query', (event: Prisma.QueryEvent) => {
      this.logger.debug('Query: ' + event.query)
      this.logger.debug('Parameters: ' + event.params)
      this.logger.debug('Duration: ' + event.duration + 'ms')
    })
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
