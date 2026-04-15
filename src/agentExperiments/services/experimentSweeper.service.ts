import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PinoLogger } from 'nestjs-pino'
import { ExperimentRunsService } from './experimentRuns.service'

const STALE_THRESHOLD_MINUTES = 45

@Injectable()
export class ExperimentSweeperService {
  constructor(
    private readonly experimentRuns: ExperimentRunsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ExperimentSweeperService.name)
  }

  @Cron('*/15 * * * *')
  async sweepStaleRuns() {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000)

    const result = await this.experimentRuns.updateMany({
      where: {
        status: { in: ['PENDING', 'RUNNING'] },
        createdAt: { lt: cutoff },
      },
      data: {
        status: 'FAILED',
        error: `Timed out waiting for callback after ${STALE_THRESHOLD_MINUTES} minutes`,
      },
    })

    if (result.count > 0) {
      this.logger.warn(
        { count: result.count, cutoff: cutoff.toISOString() },
        'Marked stale experiment runs as FAILED',
      )
    }
  }
}
