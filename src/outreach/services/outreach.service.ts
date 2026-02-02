import { Injectable, NotFoundException } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { AreaCodeFromZipService } from 'src/ai/util/areaCodeFromZip.util'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { GooglePlacesService } from 'src/vendors/google/services/google-places.service'
import { CreateOutreachSchema } from '../schemas/createOutreachSchema'
import {
  resolveP2pJobGeography as resolveP2pJobGeographyUtil,
  type P2pJobGeographyResult,
} from '../util/campaignGeography.util'

export type { P2pJobGeographyResult } from '../util/campaignGeography.util'

@Injectable()
export class OutreachService extends createPrismaBase(MODELS.Outreach) {
  constructor(
    private readonly placesService: GooglePlacesService,
    private readonly areaCodeFromZipService: AreaCodeFromZipService,
  ) {
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

  async resolveP2pJobGeography(
    campaign: Campaign,
  ): Promise<P2pJobGeographyResult> {
    return resolveP2pJobGeographyUtil(campaign, {
      placesService: this.placesService,
      areaCodeFromZipService: this.areaCodeFromZipService,
      logger: this.logger,
    })
  }
}
