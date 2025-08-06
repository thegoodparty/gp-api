import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { PeerlyAuthenticationService } from './services/peerlyAuthentication.service'
import { PeerlyIdentityService } from './services/peerlyIdentity.service'
import { PeerlyPhoneListService } from './services/peerlyPhoneList.service'
import { PeerlyMediaService } from './services/peerlyMedia.service'
import { PeerlyP2pSmsService } from './services/peerlyP2pSms.service'
import { PeerlyPollingService } from './services/peerlyPolling.service'
import { VotersModule } from '../voters/voters.module'
import { QueueProducerModule } from '../queue/producer/producer.module'

@Module({
  imports: [HttpModule, VotersModule, QueueProducerModule],
  providers: [
    PeerlyAuthenticationService,
    PeerlyIdentityService,
    PeerlyPhoneListService,
    PeerlyMediaService,
    PeerlyP2pSmsService,
    PeerlyPollingService,
  ],
  exports: [
    PeerlyAuthenticationService,
    PeerlyIdentityService,
    PeerlyPhoneListService,
    PeerlyMediaService,
    PeerlyP2pSmsService,
    PeerlyPollingService,
  ],
})
export class PeerlyModule {}
