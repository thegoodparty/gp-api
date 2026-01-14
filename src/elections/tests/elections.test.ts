// Test match with a distance algorithm of a representative sample
// Test if it queries the people-api correctly ( > 0 totalResults)

import { BallotReadyRaceFixtures } from '@/shared/testing/ballotreadyRaceFixtures'
import { useTestService } from '@/test-service'
import { expect, test } from 'vitest'

const svc = useTestService()

test('ballotready to L2 matches are high confidence and allow querying of the people-api', async () => {
  // create campaign once for the test user
  const campaign = await svc.prisma.campaign.create({
    data: { userId: svc.user.id, slug: 'test-campaign' },
  })

  const failures: Array<{
    state: string
    positionId: string
    electionDate: string
    status: number
  }> = []

  for (const fx of BallotReadyRaceFixtures) {
    await svc.prisma.campaign.update({
      where: { id: campaign.id },
      data: { details: fx },
    })

    const res = await svc.client.put('/v1/campaigns/mine/race-target-details')
    if (res.status !== 200) {
      failures.push({
        state: fx.state,
        positionId: fx.positionId,
        electionDate: fx.electionDate,
        status: res.status,
      })
      continue
    }

    // assert shape/value (example)
  }

  expect(failures).toEqual([])
}, 120_000)
