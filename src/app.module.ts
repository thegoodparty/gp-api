import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ContentModule } from './content/content.module'
import { JobsModule } from './jobs/jobs.module'

@Module({
  imports: [ContentModule, JobsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
