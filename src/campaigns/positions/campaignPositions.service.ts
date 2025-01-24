import { Injectable } from '@nestjs/common'
import { CreateCampaignPositionSchema } from './schemas/CreateCampaignPosition.schema'
import { UpdateCampaignPositionSchema } from './schemas/UpdateCampaignPosition.schema'
import { BasePrismaService } from 'src/prisma/basePrisma.service'

@Injectable()
export class CampaignPositionsService extends BasePrismaService<'campaignPosition'> {
  constructor() {
    super('campaignPosition')
  }

  findByCampaignId(campaignId: number) {
    return this.findFirstOrThrow({
      where: {
        campaignId,
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
