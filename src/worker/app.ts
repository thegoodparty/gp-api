import '../configrc'
import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { WorkerModule } from './worker.module'
import { InngestService } from 'src/inngest/inngest.service'

type BootstrapParams = {
  loggingEnabled: boolean
}

export const bootstrapWorker = async (
  params: BootstrapParams,
): Promise<NestFastifyApplication> => {
  const app = await NestFactory.create<NestFastifyApplication>(
    WorkerModule,
    new FastifyAdapter({
      ...(process.env.LOG_LEVEL
        ? {
            logger: {
              level: process.env.LOG_LEVEL,
              enabled: params.loggingEnabled,
            },
          }
        : {}),
    }),
    {
      logger: params.loggingEnabled
        ? ['log', 'error', 'warn', 'debug', 'verbose']
        : false,
    },
  )

  // Register Inngest routes
  const inngestService = app.get(InngestService)
  await inngestService.registerRoutes(app.getHttpAdapter().getInstance())

  app.enableShutdownHooks()
  return app
}
