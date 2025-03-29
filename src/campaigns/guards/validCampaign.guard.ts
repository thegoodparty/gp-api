import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class ValidCampaignGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const campaignId = request.campaign?.id

    if (!campaignId) {
      throw new NotFoundException('Campaign ID not found')
    }

    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true }, // Only select what we need
    })

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${campaignId} not found`)
    }

    return true
  }
}
