import { Global, Module } from '@nestjs/common'
import { GeminiService } from './services/gemini.service'

@Global()
@Module({
  providers: [GeminiService],
  exports: [GeminiService],
})
export class GeminiModule {}
