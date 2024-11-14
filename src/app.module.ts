import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ContentModule } from './content/content.module'
import { JobsModule } from './jobs/jobs.module'
import { HealthModule } from './health/health.module'
import { RacesModule } from './races/races.module';

@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: [ContentModule, JobsModule, HealthModule, RacesModule],
})
export class AppModule {}
