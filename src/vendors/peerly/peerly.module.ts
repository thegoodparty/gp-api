import { HttpModule } from '@nestjs/axios'
import { forwardRef, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AiModule } from 'src/ai/ai.module'
import { CampaignsModule } from '../../campaigns/campaigns.module'
import { OutreachModule } from '../../outreach/outreach.module'
import { VoterSharedModule } from '../../shared/modules/voterShared.module'
import { UsersModule } from '../../users/users.module'
import { GoogleModule } from '../google/google.module'
import { SlackModule } from '../slack/slack.module'
import { P2pController } from './p2p.controller'
import { P2pPhoneListUploadService } from './services/p2pPhoneListUpload.service'
import { PeerlyAuthenticationService } from './services/peerlyAuthentication.service'
import { PeerlyIdentityService } from './services/peerlyIdentity.service'
import { PeerlyMediaService } from './services/peerlyMedia.service'
import { PeerlyP2pJobService } from './services/peerlyP2pJob.service'
import { PeerlyP2pSmsService } from './services/peerlyP2pSms.service'
import { PeerlyPhoneListService } from './services/peerlyPhoneList.service'

@Module({
  imports: [
    HttpModule,
    JwtModule,
    AiModule,
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
export class PeerlyModule { }
