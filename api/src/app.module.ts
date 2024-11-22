import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ContentModule } from './content/content.module'
import { JobsModule } from './jobs/jobs.module'
import { HealthModule } from './health/health.module'
import { PrismaModule } from './prisma/prisma.module'
import { ContentfulModule } from './contentful/contentful.module'
import { DeclareModule } from './declare/declare.module';

@Module({
  imports: [
    ContentModule,
    HealthModule,
    PrismaModule,
    ContentfulModule,
    JobsModule,
    DeclareModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
