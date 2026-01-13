import { Module } from '@nestjs/common'
import { InngestModule } from 'src/inngest/inngest.module'

@Module({
  imports: [InngestModule],
})
export class WorkerModule {}
