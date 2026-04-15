import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { OrganizationsService } from 'src/organizations/services/organizations.service'
import { VoterFileDownloadAccessService } from '../../../shared/services/voterFileDownloadAccess.service'

@Injectable()
export class CanDownloadVoterFileGuard implements CanActivate {
  constructor(
    private campaignsService: CampaignsService,
    private voterFileDownloadAccess: VoterFileDownloadAccessService,
    private organizationsService: OrganizationsService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<{
      user: { id: number }
    }>()

    const campaign = await this.campaignsService.findByUserId(user.id)

    const district = campaign?.organizationSlug
      ? await this.organizationsService.getDistrictForOrgSlug(
          campaign.organizationSlug,
        )
      : null

    const result = this.voterFileDownloadAccess.canDownload(campaign, district)
    return Boolean(result)
  }
}
