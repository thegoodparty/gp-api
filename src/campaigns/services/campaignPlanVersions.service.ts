import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class CampaignPlanVersionsService {
  constructor(private prismaService: PrismaService) {}

  findOne(id: number) {
    return this.prismaService.campaignPlanVersion.findUnique({ where: { id } })
  }

  findByCampaignId(campaignId: number) {
    return this.prismaService.campaignPlanVersion.findFirst({
      where: { campaignId },
    })
  }

  create(data: Prisma.CampaignPlanVersionUncheckedCreateInput) {
    return this.prismaService.campaignPlanVersion.create({ data })
  }

  update(id: number, data: Prisma.CampaignPlanVersionUpdateInput) {
    return this.prismaService.campaignPlanVersion.update({
      where: { id },
      data,
    })
  }
}
