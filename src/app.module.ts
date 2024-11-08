import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ContentModule } from './content/content.module'
import { HealthModule } from './health/health.module'
import { PrismaModule } from './prisma/prisma.module'
import { ContentfulModule } from './contentful/contentful.module'

@Module({
  imports: [ContentModule, HealthModule, PrismaModule, ContentfulModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
