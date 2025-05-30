import { Injectable, Logger } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { Prisma } from '@prisma/client'

@Injectable()
export class VoterFileFilterService extends createPrismaBase(
  MODELS.VoterFileFilter,
) {
  readonly logger = new Logger(VoterFileFilterService.name)

  async findByCampaignId(campaignId: number) {
    const filters = await this.findMany({
      where: { campaignId },
    })

    if (!filters.length) {
      return []
    }

    return filters
  }

  async create(
    campaignId: number,
    data: Omit<Prisma.VoterFileFilterCreateInput, 'campaign' | 'outreach'>,
  ) {
    return this.model.create({
      data: {
        campaignId,
        ...data,
      },
    })
  }

  async update(
    id: number,
    data: Omit<Prisma.VoterFileFilterUpdateInput, 'campaign' | 'outreach'>,
  ) {
    return this.model.update({
      where: { id },
      data,
    })
  }

  async delete(id: number) {
    return this.model.delete({
      where: { id },
    })
  }
}
