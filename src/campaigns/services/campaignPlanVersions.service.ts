import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class CampaignPlanVersionsService extends createPrismaBase(
  MODELS.CampaignPlanVersion,
) {
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
