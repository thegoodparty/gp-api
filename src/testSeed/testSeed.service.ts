import { Injectable, NotFoundException } from '@nestjs/common'
import { Campaign, Prisma, TcrCompliance } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { SeedCampaignSchema } from './schemas/seedCampaign.schema'

@Injectable()
export class TestSeedService {
  constructor(private readonly prisma: PrismaService) {}

  async seedCampaign(userId: number, dto: SeedCampaignSchema) {
    const result: { campaign?: Campaign; tcrCompliance?: TcrCompliance } = {}
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: dto.campaignId, userId },
      select: { id: true },
    })

    if (!campaign) {
      throw new NotFoundException('Campaign not found')
    }

    const campaignData: Prisma.CampaignUpdateInput = {}
    if (dto.isPro !== undefined) {
      campaignData.isPro = dto.isPro
      campaignData.isVerified = dto.isPro
    }
    if (dto.hasFreeTextsOffer !== undefined) {
      campaignData.hasFreeTextsOffer = dto.hasFreeTextsOffer
    }
    if (Object.keys(campaignData).length > 0) {
      result.campaign = await this.prisma.campaign.update({
        where: { id: campaign.id },
        data: campaignData,
      })
    }

    if (dto.tcrComplianceStatus !== undefined) {
      result.tcrCompliance = await this.prisma.tcrCompliance.upsert({
        where: { campaignId: campaign.id },
        update: {
          status: dto.tcrComplianceStatus,
        },
        create: {
          campaignId: campaign.id,
          ein: '00-0000000',
          postalAddress: '123 Test St, Test City, TS 00000',
          committeeName: 'Test Campaign Committee',
          websiteDomain: 'test.goodparty.org',
          filingUrl: 'https://test.goodparty.org/filing',
          phone: '5555555555',
          email: 'tcr-test@test.local',
          officeLevel: 'local',
          status: dto.tcrComplianceStatus,
        },
      })
    }

    return result
  }
}
