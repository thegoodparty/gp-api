import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { Logger } from '@nestjs/common'
import { AppModule } from './app.module'

async function bootstrap() {
  const logger = new Logger('InngestWorker')

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    },
  )

  app.setGlobalPrefix('v1')

  const port = process.env.WORKER_PORT || 3001
  const host = process.env.HOST || '0.0.0.0'

  await app.listen(port, host)
  logger.log(`Inngest worker running on ${host}:${port}`)
  logger.log(`Inngest endpoint: http://${host}:${port}/v1/inngest`)
}

bootstrap()
