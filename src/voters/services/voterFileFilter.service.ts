import { Injectable, Logger } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { Prisma, VoterFileFilter } from '@prisma/client'
import { UpdateVoterFileFilterSchema } from '../schemas/UpdateVoterFileFilterSchema'

@Injectable()
export class VoterFileFilterService extends createPrismaBase(
  MODELS.VoterFileFilter,
) {
  readonly logger = new Logger(VoterFileFilterService.name)

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

  findByCampaignId(campaignId: number): Promise<VoterFileFilter[]> {
    return this.model.findMany({
      where: { campaignId },
      orderBy: { name: 'asc' },
    })
  }

  findByIdAndCampaignId(
    id: number,
    campaignId: number,
  ): Promise<VoterFileFilter | null> {
    return this.findFirst({
      where: { id, campaignId },
    })
  }

  updateByIdAndCampaignId(
    id: number,
    campaignId: number,
    data: UpdateVoterFileFilterSchema,
  ): Promise<VoterFileFilter> {
    return this.model.update({
      where: { id, campaignId },
      data,
    })
  }

  deleteByIdAndCampaignId(
    id: number,
    campaignId: number,
  ): Promise<VoterFileFilter> {
    return this.model.delete({
      where: { id, campaignId },
    })
  }

  // TODO: Fix the keys for the audience fields in the frontend so we don't have to do this mapping: https://goodparty.atlassian.net/browse/WEB-4277
  // NOTE: This function duplicates field mapping logic with transformRequestToFilters in P2P service.
  // Consider using the shared utility function mapAudienceFields from src/peerly/utils/audienceMapping.util.ts
  // in a future refactor to consolidate this logic and reduce code duplication.
  async voterFileFilterToAudience(idOrFilter: VoterFileFilter | number) {
    const {
      audienceSuperVoters: audience_superVoters,
      audienceLikelyVoters: audience_likelyVoters,
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
