import { Injectable, NotFoundException } from '@nestjs/common'
import { CreateCampaignPositionSchema } from './schemas/CreateCampaignPosition.schema'
import { UpdateCampaignPositionSchema } from './schemas/UpdateCampaignPosition.schema'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class CampaignPositionsService extends createPrismaBase(
  MODELS.CampaignPosition,
) {
  findByCampaignId(campaignId: number) {
    return this.model.findMany({
      where: {
        campaignId,
      },
      orderBy: {
        order: 'asc',
      },
      include: {
        topIssue: true,
        position: true,
      },
    })
  }

  create(data: CreateCampaignPositionSchema) {
    return this.model.create({ data })
  }

  async update(
    id: number,
    campaignId: number,
    { description, order }: UpdateCampaignPositionSchema,
  ) {
    const { count } = await this.model.updateMany({
      where: { id, campaignId },
      data: {
        description,
        order,
      },
    })
    if (count === 0) {
      throw new NotFoundException()
    }
  }

  async delete(id: number, campaignId: number) {
    const { count } = await this.model.deleteMany({
      where: { id, campaignId },
    })
    if (count === 0) {
      throw new NotFoundException()
    }
  }
}
