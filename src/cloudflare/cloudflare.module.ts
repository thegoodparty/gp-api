import { Module } from '@nestjs/common'
import { CloudflareService } from './services/cloudflare.service'

@Module({
  providers: [CloudflareService],
  exports: [CloudflareService],
})
export class CloudflareModule {}
