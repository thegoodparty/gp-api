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
import fastifyStatic from '@fastify/static'
import { join } from 'path'
import cookie from '@fastify/cookie'
import { PrismaExceptionFilter } from './exceptions/prisma-exception.filter'

type BootstrapParams = {
  loggingEnabled: boolean
}

export const bootstrap = async (
  params: BootstrapParams,
): Promise<NestFastifyApplication> => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
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
      rawBody: true,
      abortOnError: false, // Don't abort immediately, show all errors
      logger: params.loggingEnabled
        ? ['log', 'error', 'warn', 'debug', 'verbose']
        : false,
    },
  )
  app.setGlobalPrefix('v1')

  const swaggerConfig = new DocumentBuilder()
    .setTitle('API Documentation')
    .setDescription('The API description')
    .setVersion('1.0')
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api', app, document)

  // @ts-expect-error - Type augmentation issue with Fastify plugins
  await app.register(helmet)

  // @ts-expect-error - Type augmentation issue with Fastify plugins
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })

  // @ts-expect-error - Type augmentation issue with Fastify plugins
  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'public'),
    prefix: '/public/',
  })

  // @ts-expect-error - Type augmentation issue with Fastify plugins
  await app.register(cookie, {
    secret: process.env.AUTH_SECRET,
  })

  // @ts-expect-error - Type augmentation issue with Fastify plugins
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

  return app
}
