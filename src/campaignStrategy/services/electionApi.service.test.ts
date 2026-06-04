import { HttpService } from '@nestjs/axios'
import { BadGatewayException } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { of, throwError } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import {
  ElectionApiRaceNotFoundError,
  ElectionApiService,
} from './electionApi.service'

const BR_HASH = 'hash-abc'

const validResponse = {
  candidate_count: 2,
  candidate_office: 'City Council',
  candidates: [
    {
      gp_candidate_id: 'gp-1',
      first_name: 'Jane',
      last_name: 'Doe',
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      website_url: 'https://jane.example',
      party: 'Independent',
      is_incumbent: false,
    },
    {
      gp_candidate_id: null,
      first_name: 'Bob',
      last_name: 'Smith',
      full_name: 'Bob Smith',
      email: null,
      website_url: null,
      party: null,
      is_incumbent: null,
    },
  ],
  civics_win_number: null,
  contacts_needed_estimate: 2505,
  general_election_date: '2026-11-01',
  number_of_seats: 1,
  office_level: 'Local',
  office_type: 'Council',
  official_office_name: 'Anytown Council',
  primary_election_date: '2026-06-01',
  projected_turnout: 1000,
  relevant_election_date: '2026-06-01',
  state: 'CA',
  win_number_effective: 501,
  win_number_estimate: 501,
}

describe('ElectionApiService', () => {
  let service: ElectionApiService
  let mockHttpPost: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    process.env.ELECTION_API_URL = 'http://test-election-api'
    mockHttpPost = vi.fn()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElectionApiService,
        { provide: PinoLogger, useValue: createMockLogger() },
        { provide: HttpService, useValue: { post: mockHttpPost } },
      ],
    }).compile()

    service = module.get<ElectionApiService>(ElectionApiService)
  })

  it('POSTs the brHashId to /v1/campaign-strategy-context and returns camelCase RaceContextFromApi', async () => {
    mockHttpPost.mockReturnValue(of({ data: validResponse, status: 200 }))

    const result = await service.getRaceContext(BR_HASH)

    expect(mockHttpPost).toHaveBeenCalledWith(
      'http://test-election-api/v1/campaign-strategy-context',
      { brHashId: BR_HASH },
    )
    expect(result).toEqual({
      state: 'CA',
      candidateOffice: 'City Council',
      officialOfficeName: 'Anytown Council',
      officeLevel: 'Local',
      officeType: 'Council',
      primaryElectionDate: '2026-06-01',
      generalElectionDate: '2026-11-01',
      relevantElectionDate: '2026-06-01',
      numberOfSeats: 1,
      projectedTurnout: 1000,
      civicsWinNumber: null,
      winNumberEstimate: 501,
      winNumberEffective: 501,
      contactsNeededEstimate: 2505,
      candidateCount: 2,
      candidates: [
        {
          gpCandidateId: 'gp-1',
          firstName: 'Jane',
          lastName: 'Doe',
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          websiteUrl: 'https://jane.example',
          party: 'Independent',
          isIncumbent: false,
        },
        {
          gpCandidateId: null,
          firstName: 'Bob',
          lastName: 'Smith',
          fullName: 'Bob Smith',
          email: null,
          websiteUrl: null,
          party: null,
          isIncumbent: null,
        },
      ],
    })
  })

  it('throws BadGateway when the HTTP call fails', async () => {
    mockHttpPost.mockReturnValue(
      throwError(() => new Error('connection reset')),
    )

    await expect(service.getRaceContext(BR_HASH)).rejects.toThrow(
      BadGatewayException,
    )
  })

  it('throws ElectionApiRaceNotFoundError on a 404 (separate from generic BadGateway)', async () => {
    // 404 means "no Race row with this brHashId" — a distinguishable
    // condition the caller uses to break the poll loop. Other failures
    // are still BadGateway since they may be transient.
    const axiosError = Object.assign(
      new Error('Request failed with status code 404'),
      {
        isAxiosError: true,
        response: { status: 404, data: { message: 'Race not found' } },
        config: {},
        toJSON: () => ({}),
      },
    )
    mockHttpPost.mockReturnValue(throwError(() => axiosError))

    await expect(service.getRaceContext(BR_HASH)).rejects.toBeInstanceOf(
      ElectionApiRaceNotFoundError,
    )
  })

  it('throws BadGateway without leaking upstream error detail', async () => {
    mockHttpPost.mockReturnValue(
      throwError(() => new Error('postgres password=secret')),
    )

    await expect(service.getRaceContext(BR_HASH)).rejects.not.toThrow(/secret/)
  })

  it('strips candidates whose email contains @goodparty and recomputes candidateCount', async () => {
    const responseWithTestData = {
      ...validResponse,
      candidate_count: 4,
      candidates: [
        validResponse.candidates[0],
        {
          gp_candidate_id: 'test-1',
          first_name: 'Internal',
          last_name: 'Tester',
          full_name: 'Internal Tester',
          email: 'felix@goodparty.org',
          website_url: null,
          party: null,
          is_incumbent: null,
        },
        {
          gp_candidate_id: 'test-2',
          first_name: 'Mixed',
          last_name: 'Case',
          full_name: 'Mixed Case',
          email: 'Admin@GoodParty.com',
          website_url: null,
          party: null,
          is_incumbent: null,
        },
        validResponse.candidates[1],
      ],
    }
    mockHttpPost.mockReturnValue(
      of({ data: responseWithTestData, status: 200 }),
    )

    const result = await service.getRaceContext(BR_HASH)

    expect(result.candidates.map((c) => c.fullName)).toEqual([
      'Jane Doe',
      'Bob Smith',
    ])
    expect(result.candidateCount).toBe(2)
  })

  it('keeps candidates with null email even though @goodparty filter is on email', async () => {
    mockHttpPost.mockReturnValue(
      of({
        data: {
          ...validResponse,
          candidate_count: 1,
          candidates: [
            {
              gp_candidate_id: null,
              first_name: 'No',
              last_name: 'Email',
              full_name: 'No Email',
              email: null,
              website_url: null,
              party: null,
              is_incumbent: null,
            },
          ],
        },
        status: 200,
      }),
    )

    const result = await service.getRaceContext(BR_HASH)

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].fullName).toBe('No Email')
  })

  it('throws BadGateway when election-api returns a response that fails schema validation', async () => {
    mockHttpPost.mockReturnValue(
      of({ data: { ...validResponse, candidate_count: 'two' }, status: 200 }),
    )

    await expect(service.getRaceContext(BR_HASH)).rejects.toThrow(
      BadGatewayException,
    )
  })
})

describe('ElectionApiService construction', () => {
  it('throws when ELECTION_API_URL is not set', async () => {
    const previous = process.env.ELECTION_API_URL
    delete process.env.ELECTION_API_URL

    try {
      await expect(
        Test.createTestingModule({
          providers: [
            ElectionApiService,
            { provide: PinoLogger, useValue: createMockLogger() },
            { provide: HttpService, useValue: { post: vi.fn() } },
          ],
        }).compile(),
      ).rejects.toThrow('ELECTION_API_URL is not set')
    } finally {
      if (previous !== undefined) process.env.ELECTION_API_URL = previous
    }
  })
})
