import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { config } from 'dotenv';
import { AppModule } from './app.module';

config();

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(helmet as any);

  await app.register(cors as any, {
    origin: process.env.CORS_ORIGIN || '*',
  });

  await app.listen({
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || 'localhost',
  });
}
bootstrap();
