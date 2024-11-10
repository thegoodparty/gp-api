import { Module } from '@nestjs/common'
import { JobsService } from './jobs.service'
import { JobsController } from './jobs.controller'
import { HttpModule } from '@nestjs/axios'

@Module({
  controllers: [JobsController],
  providers: [JobsService],
  imports: [HttpModule],
})
export class JobsModule {}
