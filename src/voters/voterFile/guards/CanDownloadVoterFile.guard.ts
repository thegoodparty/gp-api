import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { VoterFileDownloadAccessService } from '../../../shared/services/voterFileDownloadAccess.service'

@Injectable()
export class CanDownloadVoterFileGuard implements CanActivate {
  constructor(
    private campaignsService: CampaignsService,
    private voterFileDownloadAccess: VoterFileDownloadAccessService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<{
      user: { id: number }
    }>()

    const campaign = await this.campaignsService.findByUserId(user.id, {
      pathToVictory: true,
    })

    const result = this.voterFileDownloadAccess.canDownload(campaign)
    return Boolean(result)
  }
}
