import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { FastifyInstance } from 'fastify'
import { InngestCommHandler, serve } from 'inngest/fastify'
import { inngest } from './inngest.client'
import {
  PollAnalysisCompleteData,
  PollAnalysisCompleteHandler,
} from './functions/pollAnalysisComplete.handler'

@Injectable()
export class InngestService implements OnModuleInit {
  private readonly logger = new Logger(InngestService.name)
  private handler: InngestCommHandler

  constructor(
    private readonly pollAnalysisCompleteHandler: PollAnalysisCompleteHandler,
  ) {}

  onModuleInit() {
    // Create Inngest function with DI handler
    const pollAnalysisCompleteFunction = inngest.createFunction(
      {
        id: 'poll-analysis-complete',
        name: 'Poll Analysis Complete Handler',
        retries: 3,
        // Concurrency control: 1 per pollId to prevent race conditions
        concurrency: [
          {
            key: 'event.data.pollId',
            limit: 1,
          },
        ],
      },
      { event: 'poll/analysis.complete' },
      async ({ event, step, logger }) => {
        logger.info('Processing poll analysis complete', {
          pollId: event.data.pollId,
          totalResponses: event.data.totalResponses,
        })

        // Execute handler with dependency injection
        return await this.pollAnalysisCompleteHandler.handle(event.data)
      },
    )

    // Create Inngest handler
    this.handler = serve({
      client: inngest,
      functions: [pollAnalysisCompleteFunction],
    })

    this.logger.log('Inngest functions registered')
  }

  // Register routes with Fastify
  async registerRoutes(fastify: FastifyInstance) {
    // Inngest requires GET and POST endpoints
    fastify.all('/api/inngest', async (request, reply) => {
      return this.handler(request, reply)
    })

    this.logger.log('Inngest routes registered at /api/inngest')
  }

  // For sending events from API
  async send(eventName: string, data: PollAnalysisCompleteData) {
    await inngest.send({
      name: eventName,
      data,
    })
  }
}
