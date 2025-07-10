import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { PeerlyAuthenticationService } from './services/peerlyAuthenticationService'

@Module({
  imports: [HttpModule],
  providers: [PeerlyAuthenticationService],
  exports: [PeerlyAuthenticationService],
})
export class PeerlyModule {}
