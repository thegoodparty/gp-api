import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ContentModule } from './content/content.module'
import { HealthModule } from './health/health.module'

@Module({
  imports: [ContentModule, HealthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
