import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class HealthService {
  constructor(
    private prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthService.name)
  }

  async checkHealth(): Promise<boolean> {
    // Right now, this just simply checks if the database connection is working,
    //   but we can add more checks here for other backend services as well..
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return true
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    } catch (e: unknown) {
      this.logger.error(
        { data: e instanceof Error ? e.message : e },
        'Health check failed => ',
      )
      return false
    }
  }
}
