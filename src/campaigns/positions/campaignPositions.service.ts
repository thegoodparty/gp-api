import { Injectable } from '@nestjs/common'
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

  update(id: number, { description, order }: UpdateCampaignPositionSchema) {
    return this.model.update({
      where: { id },
      data: {
        description,
        order,
      },
    })
  }

  delete(id: number) {
    return this.model.delete({ where: { id } })
  }
}
