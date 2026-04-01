import { Injectable, Logger } from '@nestjs/common'
import { getTemporalClient, TASK_QUEUE } from '../temporal.client'

@Injectable()
export class TemporalService {
  private readonly logger = new Logger(TemporalService.name)

  async startPollCreation(pollId: string) {
    this.logger.log(`Starting poll creation workflow for pollId: ${pollId}`)
    const client = await getTemporalClient()
    return client.workflow.start('pollCreationWorkflow', {
      taskQueue: TASK_QUEUE,
      workflowId: `poll-creation-${pollId}`,
      args: [pollId],
    })
  }

  async startPollExpansion(pollId: string) {
    this.logger.log(`Starting poll expansion workflow for pollId: ${pollId}`)
    const client = await getTemporalClient()
    return client.workflow.start('pollExpansionWorkflow', {
      taskQueue: TASK_QUEUE,
      workflowId: `poll-expansion-${pollId}`,
      args: [pollId],
    })
  }
}
