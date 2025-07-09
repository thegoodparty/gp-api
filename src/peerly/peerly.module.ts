import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { PeerlyController } from './peerly.controller'
import { PeerlyAuthenticationService } from './services/peerlyAuthenticationService'

@Module({
  imports: [HttpModule],
  controllers: [PeerlyController],
  providers: [PeerlyAuthenticationService],
  exports: [PeerlyAuthenticationService],
})
export class PeerlyModule {}
