import './configrc'
import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import { AppModule } from './app.module'
import { Logger } from '@nestjs/common'
import fastifyStatic from '@fastify/static'
import { join } from 'path'
import type { FastifyCookieOptions } from '@fastify/cookie'
import cookie from '@fastify/cookie'
import { PrismaExceptionFilter } from './exceptions/prisma-exception.filter'

const APP_LISTEN_CONFIG = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || 'localhost',
}

const bootstrap = async () => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      ...(process.env.LOG_LEVEL
        ? {
            logger: { level: process.env.LOG_LEVEL },
          }
        : {}),
    }),
    {
      rawBody: true,
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

  await app.register(helmet as any)

  await app.register(cors as any, {
    origin: process.env.CORS_ORIGIN || '*',
  })

  await app.register(fastifyStatic as any, {
    root: join(__dirname, '..', 'public'),
    prefix: '/public/',
  })

  await app.register(cookie, {
    secret: process.env.AUTH_SECRET,
  } as FastifyCookieOptions)

  app.useGlobalFilters(new PrismaExceptionFilter())

  await app.listen(APP_LISTEN_CONFIG)
  return app
}

bootstrap().then(() => {
  const logger = new Logger('bootstrap')
  logger.log(
    `App bootstrap successful => ${APP_LISTEN_CONFIG.host}:${APP_LISTEN_CONFIG.port}`,
  )
})
