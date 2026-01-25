import { Controller, Post, Get, Req, Res, Put } from '@nestjs/common'
import { FastifyRequest, FastifyReply } from 'fastify'
import { serve } from 'inngest/fastify'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { inngest } from './inngest.client'
import { PollAnalysisHandlerService } from './services/pollAnalysisHandler.service'
import { PollCreationHandlerService } from './services/pollCreationHandler.service'

type InngestFastifyRequest = FastifyRequest<{
  Querystring: Record<string, string | undefined>
}>

@Controller('inngest')
@PublicAccess()
export class InngestController {
  private handler: ReturnType<typeof serve>

  constructor(
    private readonly pollAnalysisHandler: PollAnalysisHandlerService,
    private readonly pollCreationHandler: PollCreationHandlerService,
  ) {
    const pollAnalysisCompleteFunction = inngest.createFunction(
      {
        id: 'poll-analysis-complete',
        retries: 3,
      },
      { event: 'polls/analysis.complete' },
      async ({ event, step, logger }) => {
        logger.info(
          `Processing poll analysis complete for poll ${event.data.pollId}`,
        )

        await step.run('process-poll-analysis', async () => {
          await this.pollAnalysisHandler.handlePollAnalysisComplete(event.data)
        })

        logger.info(`Completed poll analysis for poll ${event.data.pollId}`)

        return {
          pollId: event.data.pollId,
          issueCount: event.data.issues.length,
          totalResponses: event.data.totalResponses,
        }
      },
    )

    const pollCreationFunction = inngest.createFunction(
      {
        id: 'poll-creation',
        retries: 3,
      },
      { event: 'polls/created' },
      async ({ event, step, logger }) => {
        logger.info(`Processing poll creation for poll ${event.data.pollId}`)

        await step.run('sample-contacts', async () => {
          logger.info(`Sampling contacts for poll ${event.data.pollId}`)
        })

        await step.run('create-poll-messages', async () => {
          await this.pollCreationHandler.handlePollCreation(event.data)
        })

        logger.info(`Completed poll creation for poll ${event.data.pollId}`)

        return {
          pollId: event.data.pollId,
        }
      },
    )

    this.handler = serve({
      client: inngest,
      functions: [pollAnalysisCompleteFunction, pollCreationFunction],
    })
  }

  @Get()
  async introspect(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    return this.handler(req as InngestFastifyRequest, res)
  }

  @Post()
  async handleEvent(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    return this.handler(req as InngestFastifyRequest, res)
  }

  @Put()
  async register(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    return this.handler(req as InngestFastifyRequest, res)
  }
}
