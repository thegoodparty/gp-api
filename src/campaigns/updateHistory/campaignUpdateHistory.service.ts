import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { CampaignsService } from '../services/campaigns.service'
import { CreateUpdateHistorySchema } from './schemas/createUpdateHistory.schema'
import { Campaign } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { WrapperType } from 'src/shared/types/utility.types'
import { VOTER_GOALS_ADVISORY_LOCK_KEY } from '../campaigns.consts'

@Injectable()
export class CampaignUpdateHistoryService extends createPrismaBase(
  MODELS.CampaignUpdateHistory,
) {
  constructor(
    @Inject(forwardRef(() => CampaignsService))
    private readonly campaigns: WrapperType<CampaignsService>,
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

  async delete(id: number, campaignId: number) {
    const existing = await this.findFirstOrThrow({
      where: { id, campaignId },
    })

    await this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VOTER_GOALS_ADVISORY_LOCK_KEY}::integer, ${campaignId}::integer)`

      const { count } = await tx.campaignUpdateHistory.deleteMany({
        where: { id, campaignId },
      })

      if (count === 0) return

      const campaign = await tx.campaign.findUniqueOrThrow({
        where: { id: campaignId },
      })
      const { data } = campaign
      const { reportedVoterGoals } = data
      const existingType = existing.type

      if (reportedVoterGoals?.[existingType] && existing.quantity) {
        reportedVoterGoals[existingType] = Math.max(
          0,
          reportedVoterGoals[existingType] - existing.quantity,
        )

        data.reportedVoterGoals = {
          ...reportedVoterGoals,
        }

        await tx.campaign.update({
          where: { id: campaignId },
          data: { data },
        })
      }
    })
  }
}
