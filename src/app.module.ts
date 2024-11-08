import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JobsModule } from './jobs/jobs.module';

@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: [JobsModule],
})
export class AppModule {}
