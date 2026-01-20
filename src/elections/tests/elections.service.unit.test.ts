import type { HttpService } from '@nestjs/axios'
import { of, throwError } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

type SlackStub = {
  formattedMessage: ReturnType<typeof vi.fn>
}

function createAxiosError(message: string, status?: number) {
  return {
    isAxiosError: true,
    message,
    response: status
      ? {
          status,
          data: { message: `remote: ${message}` },
        }
      : undefined,
  }
}

async function importElectionsService() {
  // ElectionsService caches BASE_URL at import time.
  vi.resetModules()
  vi.stubEnv('ELECTION_API_URL', 'http://election-api.test')
  // SlackService throws at module-load if this is missing (even though we don't instantiate it).
  vi.stubEnv('SLACK_APP_ID', 'test')
  const mod = await import('../services/elections.service')
  return mod.ElectionsService
}

export function createService(opts: {
  httpGetImpl: Parameters<typeof vi.fn>[0]
  slack?: SlackStub
}) {
  const slack =
    opts.slack ??
    ({
      formattedMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as SlackStub)

  const httpService = {
    get: vi.fn(opts.httpGetImpl),
  } as unknown as HttpService

  return { httpService, slack }
}

describe('ElectionsService (unit)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  describe('getBallotReadyMatchedRaceTargetDetails', () => {
    it('calls election-api positions/by-ballotready-id with includeDistrict=true and electionDate', async () => {
      const ElectionsService = await importElectionsService()

      const payload = {
        positionId: 'p',
        brPositionId: 'br',
        brDatabaseId: 'db',
        district: {
          id: 'd1',
          L2DistrictType: 'County',
          L2DistrictName: 'Some County',
          projectedTurnout: { projectedTurnout: 100 },
        },
      }

      const { httpService, slack } = createService({
        httpGetImpl: () => of({ data: payload, status: 200 }),
      })
      const svc = new ElectionsService(httpService, slack as never)

      const result = await svc.getBallotReadyMatchedRaceTargetDetails(
        'BR_POS_ID',
        '2026-11-03',
        true,
      )

      expect(httpService.get).toHaveBeenCalledTimes(1)
      const [url, config] = (
        httpService.get as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0] as [string, { params: Record<string, unknown> }]
      expect(url).toBe(
        'http://election-api.test/v1/positions/by-ballotready-id/BR_POS_ID',
      )
      expect(config.params).toMatchObject({
        electionDate: '2026-11-03',
        includeDistrict: true,
        includeTurnout: true,
      })

      // projectedTurnout=100 => winNumber=ceil(50)+1=51, voterContactGoal=255
      expect(result).toMatchObject({
        projectedTurnout: 100,
        winNumber: 51,
        voterContactGoal: 255,
        district: { id: 'd1' },
      })
    })

    it('returns sentinel metrics when includeTurnout=false', async () => {
      const ElectionsService = await importElectionsService()

      const payload = {
        positionId: 'p',
        brPositionId: 'br',
        brDatabaseId: 'db',
        district: {
          id: 'd1',
          L2DistrictType: 'County',
          L2DistrictName: 'Some County',
          projectedTurnout: { projectedTurnout: 999 }, // ignored
        },
      }

      const { httpService, slack } = createService({
        httpGetImpl: () => of({ data: payload, status: 200 }),
      })
      const svc = new ElectionsService(httpService, slack as never)

      const result = await svc.getBallotReadyMatchedRaceTargetDetails(
        'BR_POS_ID',
        '2026-11-03',
        false,
      )

      expect(result).toMatchObject({
        district: { id: 'd1' },
        winNumber: -1,
        voterContactGoal: -1,
        projectedTurnout: -1,
      })
    })

    it('throws NotFoundException and alerts Slack if turnout is missing when includeTurnout=true', async () => {
      const ElectionsService = await importElectionsService()

      const payload = {
        positionId: 'p',
        brPositionId: 'br',
        brDatabaseId: 'db',
        district: {
          id: 'd1',
          L2DistrictType: 'County',
          L2DistrictName: 'Some County',
          projectedTurnout: {}, // missing projectedTurnout.projectedTurnout
        },
      }

      const slack: SlackStub = {
        formattedMessage: vi.fn().mockResolvedValue(undefined),
      }
      const { httpService } = createService({
        httpGetImpl: () => of({ data: payload, status: 200 }),
        slack,
      })
      const svc = new ElectionsService(httpService, slack as never)

      await expect(
        svc.getBallotReadyMatchedRaceTargetDetails(
          'BR_POS_ID',
          '2026-11-03',
          true,
        ),
      ).rejects.toMatchObject({ name: 'NotFoundException' })

      expect(slack.formattedMessage).toHaveBeenCalledTimes(1)
    })

    it('throws BadGatewayException and alerts Slack on election-api HTTP error', async () => {
      const ElectionsService = await importElectionsService()

      const slack: SlackStub = {
        formattedMessage: vi.fn().mockResolvedValue(undefined),
      }
      const { httpService } = createService({
        httpGetImpl: () =>
          throwError(() => createAxiosError('boom', 502)) as never,
        slack,
      })
      const svc = new ElectionsService(httpService, slack as never)

      await expect(
        svc.getBallotReadyMatchedRaceTargetDetails(
          'BR_POS_ID',
          '2026-11-03',
          true,
        ),
      ).rejects.toMatchObject({ name: 'BadGatewayException' })

      expect(slack.formattedMessage).toHaveBeenCalledTimes(1)
    })
  })

  describe('buildRaceTargetDetails', () => {
    it('cleans L2DistrictName before calling projectedTurnout endpoint', async () => {
      const ElectionsService = await importElectionsService()

      const payload = {
        id: 'pt1',
        brPositionId: 'br',
        createdAt: new Date(),
        updatedAt: new Date(),
        geoid: 'x',
        state: 'TX',
        L2DistrictType: 'County',
        L2DistrictName: 'LongestName',
        year: 2026,
        electionCode: 'General',
        projectedTurnout: 1000,
        inferenceDate: new Date(),
        modelVersion: 'v',
      }

      let capturedParams: Record<string, unknown> | undefined
      const { httpService, slack } = createService({
        httpGetImpl: (
          _url: string,
          config: { params: Record<string, unknown> },
        ) => {
          capturedParams = config.params
          return of({ data: payload, status: 200 })
        },
      })
      const svc = new ElectionsService(httpService, slack as never)

      await svc.buildRaceTargetDetails({
        state: 'TX',
        L2DistrictType: 'County',
        L2DistrictName: 'A##LongestName##B',
        electionDate: '2026-11-03',
      })

      expect(capturedParams).toMatchObject({
        L2DistrictName: 'LongestName',
      })
    })

    it('returns computed metrics and metadata on success', async () => {
      const ElectionsService = await importElectionsService()

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))

      const payload = {
        id: 'pt1',
        brPositionId: 'br',
        createdAt: new Date(),
        updatedAt: new Date(),
        geoid: 'x',
        state: 'TX',
        L2DistrictType: 'County',
        L2DistrictName: 'Some County',
        year: 2026,
        electionCode: 'General',
        projectedTurnout: 100,
        inferenceDate: new Date(),
        modelVersion: 'v',
      }

      const { httpService, slack } = createService({
        httpGetImpl: () => of({ data: payload, status: 200 }),
      })
      const svc = new ElectionsService(httpService, slack as never)

      const result = await svc.buildRaceTargetDetails({
        state: 'TX',
        L2DistrictType: 'County',
        L2DistrictName: 'Some County',
        electionDate: '2026-11-03',
      })

      expect(result).toMatchObject({
        projectedTurnout: 100,
        winNumber: 51,
        voterContactGoal: 255,
        source: 'ElectionApi',
        electionType: 'County',
        electionLocation: 'Some County',
        p2vStatus: 'Complete',
        p2vCompleteDate: '2026-01-15',
      })
    })

    it('returns null and alerts Slack on election-api error', async () => {
      const ElectionsService = await importElectionsService()

      const slack: SlackStub = {
        formattedMessage: vi.fn().mockResolvedValue(undefined),
      }
      const { httpService } = createService({
        httpGetImpl: () =>
          throwError(() => createAxiosError('boom', 502)) as never,
        slack,
      })
      const svc = new ElectionsService(httpService, slack as never)

      const result = await svc.buildRaceTargetDetails({
        state: 'TX',
        L2DistrictType: 'County',
        L2DistrictName: 'Some County',
        electionDate: '2026-11-03',
      })

      expect(result).toBeNull()
      expect(slack.formattedMessage).toHaveBeenCalledTimes(1)
    })
  })

  describe('districts endpoints', () => {
    it('getValidDistrictTypes includes electionYear when excludeInvalid=true', async () => {
      const ElectionsService = await importElectionsService()

      const { httpService, slack } = createService({
        httpGetImpl: (
          _url: string,
          config: { params: Record<string, unknown> },
        ) => of({ data: [], status: 200 }),
      })
      const svc = new ElectionsService(httpService, slack as never)

      await svc.getValidDistrictTypes('TX', 2025, true)

      const [, config] = (
        httpService.get as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0] as [string, { params: Record<string, unknown> }]
      expect(config.params).toMatchObject({
        state: 'TX',
        excludeInvalid: true,
        electionYear: 2025,
      })
    })

    it('getValidDistrictTypes omits electionYear when excludeInvalid=false', async () => {
      const ElectionsService = await importElectionsService()

      const { httpService, slack } = createService({
        httpGetImpl: (
          _url: string,
          config: { params: Record<string, unknown> },
        ) => of({ data: [], status: 200 }),
      })
      const svc = new ElectionsService(httpService, slack as never)

      await svc.getValidDistrictTypes('TX', 2025, false)

      const [, config] = (
        httpService.get as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0] as [string, { params: Record<string, unknown> }]
      expect(config.params).toMatchObject({
        state: 'TX',
        excludeInvalid: false,
      })
      expect(config.params).not.toHaveProperty('electionYear')
    })

    it('getValidDistrictNames includes electionYear when excludeInvalid=true', async () => {
      const ElectionsService = await importElectionsService()

      const { httpService, slack } = createService({
        httpGetImpl: (
          _url: string,
          config: { params: Record<string, unknown> },
        ) => of({ data: [], status: 200 }),
      })
      const svc = new ElectionsService(httpService, slack as never)

      await svc.getValidDistrictNames('County', 'TX', 2025, true)

      const [, config] = (
        httpService.get as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0] as [string, { params: Record<string, unknown> }]
      expect(config.params).toMatchObject({
        L2DistrictType: 'County',
        state: 'TX',
        excludeInvalid: true,
        electionYear: 2025,
      })
    })

    it('getValidDistrictNames omits electionYear when excludeInvalid=false', async () => {
      const ElectionsService = await importElectionsService()

      const { httpService, slack } = createService({
        httpGetImpl: (
          _url: string,
          config: { params: Record<string, unknown> },
        ) => of({ data: [], status: 200 }),
      })
      const svc = new ElectionsService(httpService, slack as never)

      await svc.getValidDistrictNames('County', 'TX', 2025, false)

      const [, config] = (
        httpService.get as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0] as [string, { params: Record<string, unknown> }]
      expect(config.params).toMatchObject({
        L2DistrictType: 'County',
        state: 'TX',
        excludeInvalid: false,
      })
      expect(config.params).not.toHaveProperty('electionYear')
    })
  })
})
