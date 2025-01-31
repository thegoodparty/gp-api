import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { VoterFileService } from '../voterFile.service'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'

@Injectable()
export class CanDownloadVoterFileGuard implements CanActivate {
  constructor(
    private voterFileService: VoterFileService,
    private campaignsService: CampaignsService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const { user } = context.switchToHttp().getRequest()

    const campaign = await this.campaignsService.findByUserId(user.id, {
      pathToVictory: true,
    })

    return this.voterFileService.canDownload(campaign)
  }
}
