import { useTestService } from '@/test-service'
import { BallotReadyRaceFixtures } from './ballotreadyRaceFixtures'

const service = useTestService()
let i = 0
async function createValidPostOnboardingCampaign() {
  const campaign = await service.prisma.campaign.create({
    data: {
      userId: service.user.id,
      slug: `test-campaign${i}`,
    },
  })

  await service.prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      details: {
        ...BallotReadyRaceFixtures[i],
      },
    },
  })
  ++i
}
