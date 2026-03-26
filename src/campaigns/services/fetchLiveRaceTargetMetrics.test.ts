import { ElectionsService } from '@/elections/services/elections.service'
import { useTestService } from '@/test-service'
import { describe, expect, it } from 'vitest'
import { CampaignsService } from './campaigns.service'

const KNOWN_BR_POSITION_ID = 'Z2lkOi8vYmFsbG90LWZhY3RvcnkvUG9zaXRpb24vNDYyMTM='
const KNOWN_ELECTION_DATE = '2025-11-03'

const service = useTestService()

describe('CampaignsService.fetchLiveRaceTargetMetrics (election-api integration)', () => {
  it('returns live metrics for a campaign with a valid positionId', async () => {
    const electionsService = service.app.get(ElectionsService)

    const position = await electionsService
      .getPositionByBallotReadyId(KNOWN_BR_POSITION_ID, {
        includeDistrict: false,
      })
      .catch(() => null)

    if (!position?.id) {
      console.warn('Skipping: election-api unreachable or position not found')
      return
    }

    const org = await service.prisma.organization.create({
      data: {
        slug: 'integration-test-org',
        ownerId: service.user.id,
        positionId: position.id,
      },
    })

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'integration-test-campaign',
        organizationSlug: org.slug,
        details: { electionDate: KNOWN_ELECTION_DATE },
      },
    })

    const campaignsService = service.app.get(CampaignsService)
    const fullCampaign = await service.prisma.campaign.findUniqueOrThrow({
      where: { id: campaign.id },
    })

    const metrics =
      await campaignsService.fetchLiveRaceTargetMetrics(fullCampaign)

    expect(metrics).not.toBeNull()
    expect(metrics!.projectedTurnout).toBeGreaterThan(0)
    expect(metrics!.winNumber).toBeGreaterThan(0)
    expect(metrics!.voterContactGoal).toBeGreaterThan(0)
    expect(metrics!.voterContactGoal).toBeGreaterThan(metrics!.winNumber)
  })

  it('returns null when org has no positionId', async () => {
    const org = await service.prisma.organization.create({
      data: {
        slug: 'no-position-org',
        ownerId: service.user.id,
        positionId: null,
      },
    })

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'no-position-campaign',
        organizationSlug: org.slug,
        details: { electionDate: KNOWN_ELECTION_DATE },
      },
    })

    const campaignsService = service.app.get(CampaignsService)
    const fullCampaign = await service.prisma.campaign.findUniqueOrThrow({
      where: { id: campaign.id },
    })

    const metrics =
      await campaignsService.fetchLiveRaceTargetMetrics(fullCampaign)

    expect(metrics).toBeNull()
  })

  it('returns null when campaign has no electionDate', async () => {
    const org = await service.prisma.organization.create({
      data: {
        slug: 'no-date-org',
        ownerId: service.user.id,
        positionId: 'some-uuid',
      },
    })

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'no-date-campaign',
        organizationSlug: org.slug,
        details: {},
      },
    })

    const campaignsService = service.app.get(CampaignsService)
    const fullCampaign = await service.prisma.campaign.findUniqueOrThrow({
      where: { id: campaign.id },
    })

    const metrics =
      await campaignsService.fetchLiveRaceTargetMetrics(fullCampaign)

    expect(metrics).toBeNull()
  })

  it('returns null when campaign has no organization', async () => {
    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'no-org-campaign',
        details: { electionDate: KNOWN_ELECTION_DATE },
      },
    })

    const campaignsService = service.app.get(CampaignsService)
    const fullCampaign = await service.prisma.campaign.findUniqueOrThrow({
      where: { id: campaign.id },
    })

    const metrics =
      await campaignsService.fetchLiveRaceTargetMetrics(fullCampaign)

    expect(metrics).toBeNull()
  })

  it('returns null when election-api returns no turnout data', async () => {
    const org = await service.prisma.organization.create({
      data: {
        slug: 'bad-position-org',
        ownerId: service.user.id,
        positionId: 'nonexistent-position-uuid',
      },
    })

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'bad-position-campaign',
        organizationSlug: org.slug,
        details: { electionDate: KNOWN_ELECTION_DATE },
      },
    })

    const campaignsService = service.app.get(CampaignsService)
    const fullCampaign = await service.prisma.campaign.findUniqueOrThrow({
      where: { id: campaign.id },
    })

    const metrics =
      await campaignsService.fetchLiveRaceTargetMetrics(fullCampaign)

    expect(metrics).toBeNull()
  })
})
