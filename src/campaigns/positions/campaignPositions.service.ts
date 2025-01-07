import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateCampaignPositionSchema } from './schemas/CreateCampaignPosition.schema'
import { UpdateCampaignPositionSchema } from './schemas/UpdateCampaignPosition.schema'

@Injectable()
export class CampaignPositionsService {
  private readonly logger = new Logger(CampaignPositionsService.name)
  constructor(private prisma: PrismaService) {}

  findByCampaignId(campaignId: number) {
    return this.prisma.campaignPosition.findFirstOrThrow({
      where: {
        campaignId,
      },
    })
  }

  create(data: CreateCampaignPositionSchema) {
    return this.prisma.campaignPosition.create({ data })
  }

  update(id: number, { description, order }: UpdateCampaignPositionSchema) {
    return this.prisma.campaignPosition.update({
      where: { id },
      data: {
        description,
        order,
      },
    })
  }

  delete(id: number) {
    return this.prisma.campaignPosition.delete({ where: { id } })
  }
}
