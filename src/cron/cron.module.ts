import { Module } from '@nestjs/common'
import { CronLockService } from './services/cronLock.service'

@Module({
  providers: [CronLockService],
  exports: [CronLockService],
})
export class CronModule {}
