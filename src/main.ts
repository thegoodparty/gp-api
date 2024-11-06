import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { config } from 'dotenv';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

config();

const APP_LISTEN_CONFIG = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || 'localhost',
};

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
  );

  await app.register(helmet as any);

  await app.register(cors as any, {
    origin: process.env.CORS_ORIGIN || '*',
  });

  await app.listen(APP_LISTEN_CONFIG);
  return app;
};

bootstrap().then(() => {
  const logger = new Logger('bootstrap');
  logger.log(
    `App bootstrap successful => ${APP_LISTEN_CONFIG.host}:${APP_LISTEN_CONFIG.port}`,
  );
});
