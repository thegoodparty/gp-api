import { Module } from '@nestjs/common'
import { VotersService } from './voters.service'
import { HttpModule } from '@nestjs/axios'

@Module({
  controllers: [],
  providers: [VotersService],
  imports: [HttpModule],
})
export class VotersModule {}
