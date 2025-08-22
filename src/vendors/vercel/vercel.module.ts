import { Module } from '@nestjs/common'
import { VercelService } from './services/vercel.service'

@Module({
  providers: [VercelService],
  exports: [VercelService],
})
export class VercelModule {}
