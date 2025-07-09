import { Controller } from '@nestjs/common'
import { PeerlyAuthenticationService } from './services/peerlyAuthenticationService'

@Controller('peerly')
export class PeerlyController {
  constructor(private readonly peerlyService: PeerlyAuthenticationService) {}
}
