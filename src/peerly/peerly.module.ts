import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { JwtModule } from '@nestjs/jwt'
import { PeerlyAuthenticationService } from './services/peerlyAuthentication.service'
import { PeerlyIdentityService } from './services/peerlyIdentity.service'
import { PeerlyPhoneListService } from './services/peerlyPhoneList.service'
import { PeerlyMediaService } from './services/peerlyMedia.service'
import { PeerlyP2pSmsService } from './services/peerlyP2pSms.service'

@Module({
  imports: [HttpModule, JwtModule],
  providers: [
    PeerlyAuthenticationService,
    PeerlyIdentityService,
    PeerlyPhoneListService,
    PeerlyMediaService,
    PeerlyP2pSmsService,
  ],
  exports: [
    PeerlyAuthenticationService,
    PeerlyIdentityService,
    PeerlyPhoneListService,
    PeerlyMediaService,
    PeerlyP2pSmsService,
  ],
})
export class PeerlyModule {}
