import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { ForwardEmailService } from './services/forwardEmail.service'

@Module({
  imports: [HttpModule],
  providers: [ForwardEmailService],
  exports: [ForwardEmailService],
})
export class ForwardEmailModule {}
