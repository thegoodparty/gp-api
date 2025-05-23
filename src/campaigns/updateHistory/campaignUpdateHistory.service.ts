import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { CampaignsService } from '../services/campaigns.service'
import { CreateUpdateHistorySchema } from './schemas/createUpdateHistory.schema'
import { Campaign } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class CampaignUpdateHistoryService extends createPrismaBase(
  MODELS.CampaignUpdateHistory,
) {
  constructor(
    @Inject(forwardRef(() => CampaignsService))
    private readonly campaigns: CampaignsService,
  ) {
    super()
  }

  async create(
    campaign: Campaign,
    { type, quantity }: CreateUpdateHistorySchema,
  ) {
    const { data } = campaign
    const { reportedVoterGoals = {} } = data

    // Initialize or increment the voter goal count
    reportedVoterGoals[type] = (reportedVoterGoals[type] || 0) + quantity

    data.reportedVoterGoals = { ...reportedVoterGoals }

    await this.campaigns.update({
      where: { id: campaign.id },
      data: {
        data,
      },
    })

    return this.model.create({
      data: {
        type,
        quantity,
        campaignId: campaign.id,
        userId: campaign.userId,
      },
    })
  }

  async delete(id: number) {
    const existing = await this.findFirstOrThrow({
      where: { id },
      include: { campaign: true },
    })

    const { campaign } = existing
    const { data } = campaign
    const { reportedVoterGoals } = data
    const existingType = existing.type

    if (reportedVoterGoals?.[existingType] && existing.quantity) {
      reportedVoterGoals[existingType] -= existing.quantity

      data.reportedVoterGoals = { ...reportedVoterGoals }

      await this.campaigns.update({
        where: { id: campaign.id },
        data: {
          data,
        },
      })
    }

    return this.model.delete({ where: { id } })
  }
}
