import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { CampaignsService } from '../services/campaigns.service'
import { UserRole } from '@prisma/client'

// TODO: I'm not a fan of this. But I've spent way too much time on it for now.
//  I'd prefer to have a more idiomatic way of composing Guards to accomplish this. But this works for now.
//  More info: https://github.com/nestjs/nest/issues/873#issue-341260645
@Injectable()
export class CampaignOwnerOrAdminGuard implements CanActivate {
  constructor(private campaignService: CampaignsService) {}
  async canActivate(context: ExecutionContext) {
    const { user, params } = context.switchToHttp().getRequest()
    const { id: campaignId } = params
    const campaign = await this.campaignService.findOne({
      id: parseInt(campaignId),
    })
    return user.id === campaign?.userId || user.roles.includes(UserRole.admin)
  }
}
