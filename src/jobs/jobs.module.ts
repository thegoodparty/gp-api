import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { JobsController } from './jobs.controller'
import { JobsService } from './jobs.service'

@Module({
  controllers: [JobsController],
  providers: [JobsService],
  imports: [HttpModule],
})
export class JobsModule {}
