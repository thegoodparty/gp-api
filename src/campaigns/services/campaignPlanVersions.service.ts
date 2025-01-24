import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { BasePrismaService } from 'src/prisma/basePrisma.service'

@Injectable()
export class CampaignPlanVersionsService extends BasePrismaService<'campaignPlanVersion'> {
  constructor() {
    super('campaignPlanVersion')
  }

  findByCampaignId(campaignId: number) {
    return this.findFirst({
      where: { campaignId },
    })
  }

  create(data: Prisma.CampaignPlanVersionUncheckedCreateInput) {
    return this.model.create({ data })
  }

  update(id: number, data: Prisma.CampaignPlanVersionUpdateInput) {
    return this.model.update({
      where: { id },
      data,
    })
  }
}
