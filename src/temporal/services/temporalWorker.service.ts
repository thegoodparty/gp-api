import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common'
import { NativeConnection, Worker } from '@temporalio/worker'
import { TASK_QUEUE } from '../temporal.client'
import * as activities from '../activities/poll.activities'
import { setPollExecutionService } from '../activities/poll.activities'
import { PollExecutionService } from '@/polls/services/pollExecution.service'
import * as path from 'path'

@Injectable()
export class TemporalWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TemporalWorkerService.name)
  private worker: Worker | undefined

  constructor(private readonly pollExecutionService: PollExecutionService) {}

  async onModuleInit() {
    setPollExecutionService(this.pollExecutionService)

    try {
      const connection = await NativeConnection.connect({
        address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
      })

      this.worker = await Worker.create({
        connection,
        namespace: 'default',
        taskQueue: TASK_QUEUE,
        workflowsPath: path.resolve(__dirname, '../workflows/poll.workflows'),
        activities,
      })

      this.logger.log(`Temporal worker started on task queue: ${TASK_QUEUE}`)
      this.worker.run().catch((err) => {
        this.logger.error('Temporal worker failed', err)
      })
    } catch (err) {
      this.logger.error('Failed to start Temporal worker', err)
    }
  }

  async onModuleDestroy() {
    if (this.worker) {
      this.worker.shutdown()
      this.logger.log('Temporal worker shut down')
    }
  }
}
