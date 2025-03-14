import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class HealthService {
  constructor(private prisma: PrismaService) {}
  private readonly logger = new Logger(HealthService.name)
  async checkHealth(): Promise<boolean> {
    // Right now, this just simply checks if the database connection is working,
    //   but we can add more checks here for other backend services as well..
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return true
    } catch (e: unknown) {
      this.logger.error(
        'Health check failed => ',
        e instanceof Error ? e.message : e,
      )
      return false
    }
  }
}
