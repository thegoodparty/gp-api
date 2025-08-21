import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { JwtModule } from '@nestjs/jwt'
import { PeerlyAuthenticationService } from './services/peerlyAuthentication.service'
import { PeerlyIdentityService } from './services/peerlyIdentity.service'
import { PeerlyPhoneListService } from './services/peerlyPhoneList.service'
import { PeerlyMediaService } from './services/peerlyMedia.service'
import { PeerlyP2pSmsService } from './services/peerlyP2pSms.service'
import { P2pPhoneListUploadService } from './services/p2pPhoneListUpload.service'
import { P2pController } from './p2p.controller'
import { GoogleModule } from '../vendors/google/google.module'
import { VoterSharedModule } from '../shared/modules/voterShared.module'
import { CampaignsModule } from '../campaigns/campaigns.module'

@Module({
  imports: [
    HttpModule,
    JwtModule,
    GoogleModule,
    VoterSharedModule,
    CampaignsModule,
  ],
  controllers: [P2pController],
  providers: [
    PeerlyAuthenticationService,
    PeerlyIdentityService,
    PeerlyPhoneListService,
    PeerlyMediaService,
    PeerlyP2pSmsService,
    P2pPhoneListUploadService,
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
