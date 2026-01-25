import { Injectable, Logger } from '@nestjs/common'
import { InngestFunction } from 'inngest'
import { inngest } from '../inngest.client'
import { PollExecutionService } from 'src/polls/services/pollExecution.service'

@Injectable()
export class InngestFunctionsService {
  private readonly logger = new Logger(InngestFunctionsService.name)

  constructor(private readonly pollExecutionService: PollExecutionService) {}

  getFunctions(): InngestFunction.Any[] {
    return [
      this.createPollCreationFunction(),
      this.createPollExpansionFunction(),
    ]
  }

  private createPollCreationFunction() {
    return inngest.createFunction(
      {
        id: 'poll-creation',
        name: 'Poll Creation',
        retries: 3,
      },
      { event: 'polls/creation.requested' },
      async ({ event, step }) => {
        const { pollId } = event.data

        this.logger.log(`Processing poll creation for pollId: ${pollId}`)

        await step.run('execute-poll-creation', async () => {
          return this.pollExecutionService.executePollCreation(pollId)
        })

        return { success: true, pollId }
      },
    )
  }

  private createPollExpansionFunction() {
    return inngest.createFunction(
      {
        id: 'poll-expansion',
        name: 'Poll Expansion',
        retries: 3,
      },
      { event: 'polls/expansion.requested' },
      async ({ event, step }) => {
        const { pollId } = event.data

        this.logger.log(`Processing poll expansion for pollId: ${pollId}`)

        await step.run('execute-poll-expansion', async () => {
          return this.pollExecutionService.executePollExpansion(pollId)
        })

        return { success: true, pollId }
      },
    )
  }
}
