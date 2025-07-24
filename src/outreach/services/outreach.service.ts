import { Injectable, NotFoundException } from '@nestjs/common'
import { CreateOutreachSchema } from '../schemas/createOutreachSchema'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class OutreachService extends createPrismaBase(MODELS.Outreach) {
  constructor() {
    super()
  }

  async create(createOutreachDto: CreateOutreachSchema, imageUrl?: string) {
    return await this.model.create({
      data: {
        ...createOutreachDto,
        ...(imageUrl ? { imageUrl } : {}),
      },
      include: {
        voterFileFilter: true,
      },
    })
  }

  async findByCampaignId(campaignId: number) {
    const outreachCampaigns = await this.findMany({
      where: { campaignId },
      include: {
        voterFileFilter: true,
      },
    })

    if (!outreachCampaigns.length) {
      throw new NotFoundException(
        `No text campaigns found for campaign ID ${campaignId}`,
      )
    }

    return outreachCampaigns
  }
}
