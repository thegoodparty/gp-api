import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { PeerlyAuthenticationService } from './services/peerlyAuthentication.service'
import { PeerlyIdentityService } from './services/peerlyIdentity.service'
import { PhoneListService } from './services/phoneList.service'
import { MediaService } from './services/media.service'
import { P2pSmsService } from './services/p2pSms.service'
import { VotersModule } from '../voters/voters.module'

@Module({
  imports: [HttpModule, VotersModule],
  providers: [
    PeerlyAuthenticationService,
    PeerlyIdentityService,
    PhoneListService,
    MediaService,
    P2pSmsService,
  ],
  exports: [
    PeerlyAuthenticationService,
    PeerlyIdentityService,
    PhoneListService,
    MediaService,
    P2pSmsService,
  ],
})
export class PeerlyModule {}
