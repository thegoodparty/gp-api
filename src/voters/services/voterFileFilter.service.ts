import { BadRequestException, Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { Prisma, VoterFileFilter } from '@prisma/client'
import { UpdateVoterFileFilterSchema } from '../schemas/UpdateVoterFileFilterSchema'

@Injectable()
export class VoterFileFilterService extends createPrismaBase(
  MODELS.VoterFileFilter,
) {
  async create(
    organizationSlug: string,
    data: Omit<
      Prisma.VoterFileFilterCreateInput,
      'campaign' | 'outreach' | 'organization'
    >,
  ) {
    return this.model.create({
      data: {
        organizationSlug,
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

  findByOrganizationSlug(slug: string): Promise<VoterFileFilter[]> {
    return this.model.findMany({
      where: { organizationSlug: slug },
      orderBy: { name: 'asc' },
    })
  }

  findByIdAndOrganizationSlug(
    id: number,
    organizationSlug: string,
  ): Promise<VoterFileFilter | null> {
    return this.findFirst({
      where: { id, organizationSlug },
    })
  }

  updateByIdAndOrganizationSlug(
    id: number,
    organizationSlug: string,
    data: UpdateVoterFileFilterSchema,
  ): Promise<VoterFileFilter> {
    return this.model.update({
      where: { id, organizationSlug },
      data,
    })
  }

  deleteByIdAndOrganizationSlug(
    id: number,
    organizationSlug: string,
  ): Promise<VoterFileFilter> {
    return this.model.delete({
      where: { id, organizationSlug },
    })
  }

  // TODO: Fix the keys for the audience fields in the frontend so we don't have to do this mapping: https://goodparty.atlassian.net/browse/WEB-4277
  // NOTE: This function duplicates field mapping logic with transformRequestToFilters in P2P service.
  // Consider using the shared utility function mapAudienceFields from src/peerly/utils/audienceMapping.util.ts
  // in a future refactor to consolidate this logic and reduce code duplication.
  async voterFileFilterToAudience(idOrFilter: VoterFileFilter | number) {
    const {
      audienceSuperVoters,
      audienceLikelyVoters,
      audienceUnreliableVoters,
      audienceUnlikelyVoters,
      audienceFirstTimeVoters,
      partyIndependent,
      partyDemocrat,
      partyRepublican,
      age18_25,
      age25_35,
      age35_50,
      age50Plus,
      genderMale,
      genderFemale,
    }: Partial<VoterFileFilter> =
      typeof idOrFilter === 'number'
        ? await this.model.findUniqueOrThrow({ where: { id: idOrFilter } })
        : idOrFilter

    return {
      ...(audienceSuperVoters === true
        ? { audience_superVoters: audienceSuperVoters }
        : {}),
      ...(audienceLikelyVoters === true
        ? { audience_likelyVoters: audienceLikelyVoters }
        : {}),
      ...(audienceUnreliableVoters === true
        ? { audience_unreliableVoters: audienceUnreliableVoters }
        : {}),
      ...(audienceUnlikelyVoters === true
        ? { audience_unlikelyVoters: audienceUnlikelyVoters }
        : {}),
      ...(audienceFirstTimeVoters === true
        ? { audience_firstTimeVoters: audienceFirstTimeVoters }
        : {}),
      ...(partyIndependent === true
        ? { party_independent: partyIndependent }
        : {}),
      ...(partyDemocrat === true ? { party_democrat: partyDemocrat } : {}),
      ...(partyRepublican === true
        ? { party_republican: partyRepublican }
        : {}),
      ...(age18_25 === true ? { age_18_25: age18_25 } : {}),
      ...(age25_35 === true ? { age_25_35: age25_35 } : {}),
      ...(age35_50 === true ? { age_35_50: age35_50 } : {}),
      ...(age50Plus === true ? { age_50_plus: age50Plus } : {}),
      ...(genderMale === true ? { gender_male: genderMale } : {}),
      ...(genderFemale === true ? { gender_female: genderFemale } : {}),
    }
  }

  async filterAccessCheck(organizationSlug: string): Promise<void> {
    if (organizationSlug.startsWith('campaign-')) {
      const campaign = await this._prisma.campaign.findFirst({
        where: { organizationSlug },
      })

      if (!campaign?.isPro) {
        throw new BadRequestException('Campaign is not pro')
      }
    }
  }
}
