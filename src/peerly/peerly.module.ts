import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { PeerlyAuthenticationService } from './services/peerlyAuthentication.service'
import { PeerlyIdentityService } from './services/peerlyIdentity.service'

@Module({
  imports: [HttpModule],
  providers: [PeerlyAuthenticationService, PeerlyIdentityService],
  exports: [PeerlyAuthenticationService, PeerlyIdentityService],
})
export class PeerlyModule {}
