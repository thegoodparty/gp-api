import { Injectable, Logger } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { Prisma, VoterFileFilter } from '@prisma/client'

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

  async voterFileFilterToAudience(idOrFilter: VoterFileFilter | number) {
    const {
      audienceSuperVoters: audience_superVoters,
      audienceLikelyVoters: audience_likelyVoters,
      audienceUnreliableVoters: audience_unreliableVoters,
      audienceUnlikelyVoters: audience_unlikelyVoters,
      audienceFirstTimeVoters: audience_firstTimeVoters,
      partyIndependent: party_independent,
      partyDemocrat: party_democrat,
      partyRepublican: party_republican,
      age18_25: age_18_25,
      age25_35: age_25_35,
      age35_50: age_35_50,
      age50Plus: age_50_plus,
      genderMale: gender_male,
      genderFemale: gender_female,
    }: Partial<VoterFileFilter> = typeof idOrFilter === 'number'
      ? await this.model.findUniqueOrThrow({ where: { id: idOrFilter } })
      : idOrFilter

    return {
      ...(audience_superVoters === true ? { audience_superVoters } : {}),
      ...(audience_likelyVoters === true ? { audience_likelyVoters } : {}),
      ...(audience_unreliableVoters === true
        ? { audience_unreliableVoters }
        : {}),
      ...(audience_unlikelyVoters === true ? { audience_unlikelyVoters } : {}),
      ...(audience_firstTimeVoters === true
        ? { audience_firstTimeVoters }
        : {}),
      ...(party_independent === true ? { party_independent } : {}),
      ...(party_democrat === true ? { party_democrat } : {}),
      ...(party_republican === true ? { party_republican } : {}),
      ...(age_18_25 === true ? { age_18_25 } : {}),
      ...(age_25_35 === true ? { age_25_35 } : {}),
      ...(age_35_50 === true ? { age_35_50 } : {}),
      ...(age_50_plus === true ? { age_50_plus } : {}),
      ...(gender_male === true ? { gender_male } : {}),
      ...(gender_female === true ? { gender_female } : {}),
    }
  }
}
