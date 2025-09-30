import { forwardRef, Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { JwtModule } from '@nestjs/jwt'
import { PeerlyAuthenticationService } from './services/peerlyAuthentication.service'
import { PeerlyIdentityService } from './services/peerlyIdentity.service'
import { PeerlyPhoneListService } from './services/peerlyPhoneList.service'
import { PeerlyMediaService } from './services/peerlyMedia.service'
import { PeerlyP2pSmsService } from './services/peerlyP2pSms.service'
import { P2pPhoneListUploadService } from './services/p2pPhoneListUpload.service'
import { PeerlyP2pJobService } from './services/peerlyP2pJob.service'
import { P2pController } from './p2p.controller'
import { GoogleModule } from '../google/google.module'
import { VoterSharedModule } from '../../shared/modules/voterShared.module'
import { CampaignsModule } from '../../campaigns/campaigns.module'
import { OutreachModule } from '../../outreach/outreach.module'
import { SlackModule } from '../slack/slack.module'
import { UsersModule } from '../../users/users.module'

@Module({
  imports: [
    HttpModule,
    JwtModule,
    GoogleModule,
    VoterSharedModule,
    SlackModule,
    forwardRef(() => CampaignsModule),
    forwardRef(() => OutreachModule),
    UsersModule,
  ],
  controllers: [P2pController],
  providers: [
    PeerlyAuthenticationService,
    PeerlyIdentityService,
    PeerlyPhoneListService,
    PeerlyMediaService,
    PeerlyP2pSmsService,
    P2pPhoneListUploadService,
    PeerlyP2pJobService,
  ],
  exports: [
    PeerlyAuthenticationService,
    PeerlyIdentityService,
    PeerlyPhoneListService,
    PeerlyMediaService,
    PeerlyP2pSmsService,
    PeerlyP2pJobService, // Export for use in OutreachModule
  ],
})
export class PeerlyModule {}
