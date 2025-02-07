import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { VoterFileDownloadAccessService } from '../../../shared/services/voterFileDownloadAccess.service'

@Injectable()
export class CanDownloadVoterFileGuard implements CanActivate {
  constructor(
    private campaignsService: CampaignsService,
    private voterFileDownloadAccess: VoterFileDownloadAccessService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const { user } = context.switchToHttp().getRequest()

    const campaign = await this.campaignsService.findByUserId(user.id, {
      pathToVictory: true,
    })

    return this.voterFileDownloadAccess.canDownload(campaign)
  }
}
