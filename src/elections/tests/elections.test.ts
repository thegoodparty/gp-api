// Test match with a distance algorithm of a representative sample
// Test if it queries the people-api correctly ( > 0 totalResults)

import { BallotReadyRaceFixtures } from '@/shared/testing/ballotreadyRaceFixtures'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { HttpService } from '@nestjs/axios'
import axios from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { ElectionsService } from '../services/elections.service'

vi.stubEnv('ELECTION_API_URL', 'https://election-api-dev.goodparty.org')
vi.stubEnv('SLACK_APP_ID', 'test')

describe('ballotready to L2 matches are high confidence and allow querying of the people-api', () => {
  it('all fixtures resolve to a matched district', async () => {
    vi.resetModules()
    const { ElectionsService } = await import(
      '../services/elections.service.js'
    )

    const http = new HttpService(
      axios.create({
        timeout: 30_000,
      }),
    )

    const slackMock = {
      formattedMessage: vi.fn().mockResolvedValue(undefined),
    }

    const svc: ElectionsService = new ElectionsService(
      http,
      slackMock as unknown as SlackService,
    )

    for (const fx of BallotReadyRaceFixtures) {
      const res = await svc.getBallotReadyMatchedRaceTargetDetails(
        fx.positionId,
        fx.electionDate,
        true,
      )

      expect(res.district?.id).toBeTruthy()
      expect(res.projectedTurnout).toBeGreaterThan(0)

      fuzzball.partial_ratio()
    }
  }, 120_000)
})
