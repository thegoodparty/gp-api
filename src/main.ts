import './configrc'
import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { AppModule } from './app.module'
import { Logger } from '@nestjs/common'
import fastifyStatic from '@fastify/static'
import { join } from 'path'
import cookie from '@fastify/cookie'
import { PrismaExceptionFilter } from './exceptions/prisma-exception.filter'
import { randomUUID } from 'crypto'
import { requestContextStore } from './logging/request-context.service'
import { CustomLogger } from './logging/custom-logger'

const APP_LISTEN_CONFIG = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || 'localhost',
}

const bootstrap = async () => {
  const logger = new CustomLogger()
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      ...(process.env.LOG_LEVEL
        ? {
            disableRequestLogging: true,
            logger: { level: process.env.LOG_LEVEL },
            genReqId: () => randomUUID(),
          }
        : {}),
    }),
    {
      rawBody: true,
      logger,
    },
  )

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      requestContextStore.run(request, () => {
        logger.log('HTTP request received')
        done()
      })
    })
    .addHook('onResponse', (request, reply, done) => {
      logger.log('HTTP request completed', {
        response: {
          contentLength: reply.getHeader('content-length'),
          statusCode: reply.statusCode,
        },
      })
      done()
    })

  app.useLogger(logger)

  app.setGlobalPrefix('v1')

  const swaggerConfig = new DocumentBuilder()
    .setTitle('API Documentation')
    .setDescription('The API description')
    .setVersion('1.0')
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api', app, document)

  await app.register(helmet)

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })

  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'public'),
    prefix: '/public/',
  })

  await app.register(cookie, {
    secret: process.env.AUTH_SECRET,
  })

  await app.register(multipart, {
    limits: {
      // global default limits, can be overidden at handler level
      fields: 100, // Max number of non-file fields
      fileSize: 10_000_000, // For multipart forms, the max file size in bytes
      files: 1, // Max number of file fields
      parts: 100, // For multipart forms, the max number of parts (fields + files)
    },
  })

  app.useGlobalFilters(new PrismaExceptionFilter())
  app.enableShutdownHooks()

  await app.listen(APP_LISTEN_CONFIG)
  return app
}

bootstrap().then(() => {
  const logger = new Logger('bootstrap')
  logger.log(
    `App bootstrap successful => ${APP_LISTEN_CONFIG.host}:${APP_LISTEN_CONFIG.port}`,
  )
})
