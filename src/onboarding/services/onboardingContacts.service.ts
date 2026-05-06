import { BadRequestException, Injectable } from '@nestjs/common'
import { ContactsService } from '@/contacts/services/contacts.service'
import { ElectionsService } from '@/elections/services/elections.service'
import { StatsResponse } from '@/contacts/contacts.types'

@Injectable()
export class OnboardingContactsService {
  constructor(
    private readonly contacts: ContactsService,
    private readonly elections: ElectionsService,
  ) {}

  async getStatsByDistrictOrPosition({
    districtId,
    ballotReadyPositionId,
  }: {
    districtId?: string
    ballotReadyPositionId?: string
  }): Promise<StatsResponse> {
    const resolvedDistrictId =
      districtId ?? (await this.resolveDistrictId(ballotReadyPositionId))

    if (!resolvedDistrictId) {
      throw new BadRequestException(
        'Could not resolve a district from the provided parameters',
      )
    }

    return this.contacts.fetchStatsByDistrictId(resolvedDistrictId)
  }

  private async resolveDistrictId(
    ballotReadyPositionId?: string,
  ): Promise<string | undefined> {
    if (!ballotReadyPositionId) return undefined

    const position = await this.elections.getPositionByBallotReadyId(
      ballotReadyPositionId,
      { includeDistrict: true },
    )
    return position?.district?.id ?? undefined
  }
}
