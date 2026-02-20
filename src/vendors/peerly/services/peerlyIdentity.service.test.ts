import { HttpService } from '@nestjs/axios'
import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import {
  Campaign,
  CommitteeType,
  Domain,
  DomainStatus,
  OfficeLevel,
  User,
} from '@prisma/client'
import { of } from 'rxjs'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AreaCodeFromZipService } from '../../../ai/util/areaCodeFromZip.util'
import { BallotReadyPositionLevel } from '../../../campaigns/campaigns.types'
import { CampaignsService } from '../../../campaigns/services/campaigns.service'
import { UsersService } from '../../../users/services/users.service'
import { GooglePlacesService } from '../../google/services/google-places.service'
import { SlackService } from '../../slack/services/slack.service'
import { PEERLY_CV_VERIFICATION_TYPE } from '../peerly.types'
import { PeerlyIdentityService } from './peerlyIdentity.service'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { createMockLogger } from '../../../shared/test-utils/mockLogger.util'

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'candidate@example.com',
    phone: '+15551234567',
    firstName: 'Jane',
    lastName: 'Doe',
    name: 'Jane Doe',
    createdAt: new Date(),
    updatedAt: new Date(),
    metaData: null,
    avatar: null,
    zip: '62701',
    password: null,
    hasPassword: false,
    roles: [],
    passwordResetToken: null,
    ...overrides,
  }
}

function createMockCampaign(
  overrides: Omit<Partial<Campaign>, 'details'> & {
    details?: PrismaJson.CampaignDetails
  } = {},
): Campaign {
  const { details, ...rest } = overrides
  const campaign: Campaign = {
    id: 1,
    slug: 'test-campaign',
    isVerified: false,
    isActive: true,
    isPro: false,
    isDemo: false,
    didWin: null,
    dateVerified: null,
    tier: null,
    formattedAddress: '123 Main St, Springfield, IL 62701',
    details: {
      electionDate: '2024-11-05',
      ballotLevel: BallotReadyPositionLevel.FEDERAL,
      ...details,
    },
    placeId: 'test-place-id',
    aiContent: {},
    data: {},
    vendorTsData: {},
    userId: 1,
    canDownloadFederal: false,
    completedTaskIds: [],
    hasFreeTextsOffer: false,
    freeTextsOfferRedeemedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...rest,
  }
  return campaign
}

function createMockDomain(overrides: Partial<Domain> = {}): Domain {
  return {
    id: 1,
    name: 'candidate.com',
    websiteId: 1,
    status: DomainStatus.active,
    operationId: null,
    price: null,
    paymentId: null,
    emailForwardingDomainId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('PeerlyIdentityService', () => {
  let service: PeerlyIdentityService
  let module: TestingModule
  let lastSubmittedData: Record<string, unknown>

  const mockPlacesResponse = {
    address_components: [
      { types: ['street_number'], long_name: '123', short_name: '123' },
      { types: ['route'], long_name: 'Main St', short_name: 'Main St' },
      {
        types: ['locality', 'political'],
        long_name: 'Springfield',
        short_name: 'Springfield',
      },
      {
        types: ['administrative_area_level_2', 'political'],
        long_name: 'Sangamon',
        short_name: 'Sangamon',
      },
      {
        types: ['administrative_area_level_1', 'political'],
        long_name: 'Illinois',
        short_name: 'IL',
      },
      { types: ['postal_code'], long_name: '62701', short_name: '62701' },
    ],
  }

  const baseUser = createMockUser()
  const baseDomain = createMockDomain()

  beforeEach(async () => {
    const mockPostFn = vi
      .fn()
      .mockImplementation((_url: string, data: Record<string, unknown>) => {
        lastSubmittedData = data
        return of({
          data: { message: 'success', verification_id: 'v123' },
        })
      })
    // The service accesses httpService[method.name], so the function needs a proper name
    Object.defineProperty(mockPostFn, 'name', { value: 'post' })

    module = await Test.createTestingModule({
      providers: [
        PeerlyIdentityService,
        {
          provide: HttpService,
          useValue: {
            post: mockPostFn,
          },
        },
        {
          provide: PeerlyAuthenticationService,
          useValue: {
            getAuthorizationHeader: vi.fn().mockResolvedValue({
              Authorization: 'Bearer test-token',
            }),
          },
        },
        {
          provide: GooglePlacesService,
          useValue: {
            getAddressByPlaceId: vi.fn().mockResolvedValue(mockPlacesResponse),
          },
        },
        {
          provide: SlackService,
          useValue: { message: vi.fn() },
        },
        {
          provide: UsersService,
          useValue: { findByCampaign: vi.fn().mockResolvedValue(baseUser) },
        },
        {
          provide: CampaignsService,
          useValue: { findFirstOrThrow: vi.fn() },
        },
        {
          provide: AreaCodeFromZipService,
          useValue: { getAreaCodeFromZip: vi.fn() },
        },
      ],
    }).compile()

    service = module.get<PeerlyIdentityService>(PeerlyIdentityService)

    const mockLogger = createMockLogger()
    Object.defineProperty(service, 'logger', {
      get: () => mockLogger,
      configurable: true,
    })
  })

  describe('submitCampaignVerifyRequest', () => {
    const testCases = [
      // Federal submissions
      {
        name: 'federal House candidate',
        input: {
          officeLevel: OfficeLevel.federal,
          committeeType: CommitteeType.HOUSE,
          fecCommitteeId: 'C00123456',
          ballotLevel: BallotReadyPositionLevel.FEDERAL,
        },
        expected: {
          verification_type: PEERLY_CV_VERIFICATION_TYPE.Federal,
          committee_type: 'H', // Peerly API expects short code
          fec_committee_id: 'C00123456',
          has_city_county: false,
        },
      },
      {
        name: 'federal Senate candidate',
        input: {
          officeLevel: OfficeLevel.federal,
          committeeType: CommitteeType.SENATE,
          fecCommitteeId: 'C00123456',
          ballotLevel: BallotReadyPositionLevel.FEDERAL,
        },
        expected: {
          verification_type: PEERLY_CV_VERIFICATION_TYPE.Federal,
          committee_type: 'S', // Peerly API expects short code
          fec_committee_id: 'C00123456',
          has_city_county: false,
        },
      },
      {
        name: 'federal Presidential candidate',
        input: {
          officeLevel: OfficeLevel.federal,
          committeeType: CommitteeType.PRESIDENTIAL,
          fecCommitteeId: 'C00123456',
          ballotLevel: BallotReadyPositionLevel.FEDERAL,
        },
        expected: {
          verification_type: PEERLY_CV_VERIFICATION_TYPE.Federal,
          committee_type: 'P', // Peerly API expects short code
          fec_committee_id: 'C00123456',
          has_city_county: false,
        },
      },
      // State submissions
      {
        name: 'state candidate',
        input: {
          officeLevel: OfficeLevel.state,
          committeeType: CommitteeType.CANDIDATE,
          fecCommitteeId: null,
          ballotLevel: BallotReadyPositionLevel.STATE,
        },
        expected: {
          verification_type: PEERLY_CV_VERIFICATION_TYPE.StateLocal,
          committee_type: 'CA', // Peerly API expects short code
          fec_committee_id: undefined,
          has_city_county: false,
        },
      },
      // Local submissions
      {
        name: 'local CITY-level candidate',
        input: {
          officeLevel: OfficeLevel.local,
          committeeType: CommitteeType.CANDIDATE,
          fecCommitteeId: null,
          ballotLevel: BallotReadyPositionLevel.CITY,
        },
        expected: {
          verification_type: PEERLY_CV_VERIFICATION_TYPE.StateLocal,
          committee_type: 'CA', // Peerly API expects short code
          fec_committee_id: undefined,
          has_city_county: true,
          city_county: 'Springfield',
        },
      },
      {
        name: 'local COUNTY-level candidate',
        input: {
          officeLevel: OfficeLevel.local,
          committeeType: CommitteeType.CANDIDATE,
          fecCommitteeId: null,
          ballotLevel: BallotReadyPositionLevel.COUNTY,
        },
        expected: {
          verification_type: PEERLY_CV_VERIFICATION_TYPE.StateLocal,
          committee_type: 'CA', // Peerly API expects short code
          fec_committee_id: undefined,
          has_city_county: true,
          city_county: 'Sangamon',
        },
      },
    ]

    testCases.forEach(({ name, input, expected }) => {
      it(name, async () => {
        const campaign = createMockCampaign({
          details: {
            electionDate: '2024-11-05',
            ballotLevel: input.ballotLevel,
          },
        })

        const tcrComplianceInput = {
          email: 'candidate@example.com',
          ein: '12-3456789',
          phone: '15551234567',
          peerlyIdentityId: 'peerly-123',
          filingUrl: 'https://fec.gov/filing/123',
          officeLevel: input.officeLevel,
          fecCommitteeId: input.fecCommitteeId,
          committeeType: input.committeeType,
        }

        await service.submitCampaignVerifyRequest(
          tcrComplianceInput,
          baseUser,
          campaign,
          baseDomain,
        )

        expect(lastSubmittedData.verification_type).toBe(
          expected.verification_type,
        )
        expect(lastSubmittedData.committee_type).toBe(expected.committee_type)

        if (expected.fec_committee_id !== undefined) {
          expect(lastSubmittedData.fec_committee_id).toBe(
            expected.fec_committee_id,
          )
        } else {
          expect(lastSubmittedData).not.toHaveProperty('fec_committee_id')
        }

        if (expected.has_city_county) {
          expect(lastSubmittedData.city_county).toBe(expected.city_county)
        } else {
          expect(lastSubmittedData).not.toHaveProperty('city_county')
        }
      })
    })

    it('includes verification_method, filing_phone_number, filing_phone_type, and filing_url_instructions when calling Peerly', async () => {
      const campaign = createMockCampaign({
        details: {
          electionDate: '2024-11-05',
          ballotLevel: BallotReadyPositionLevel.STATE,
        },
      })

      const tcrComplianceInput = {
        email: 'candidate@example.com',
        ein: '12-3456789',
        phone: '15551234567',
        peerlyIdentityId: 'peerly-123',
        filingUrl: 'https://state.gov/filing/123',
        officeLevel: OfficeLevel.state,
        fecCommitteeId: null,
        committeeType: CommitteeType.CANDIDATE,
      }

      await service.submitCampaignVerifyRequest(
        tcrComplianceInput,
        baseUser,
        campaign,
        baseDomain,
      )

      // Verify text is the preferred verification method
      expect(lastSubmittedData.verification_method).toBe('email')

      // Verify fallback instructions are included
      expect(lastSubmittedData.filing_url_instructions).toBe(
        "Deliver the PIN using the first contact information that matches the candidate's election filing, in the following order: email, text, phone call, then postal mail. If the filing is not publicly available, contact the election authority.",
      )

      // Verify filing phone number and type are included
      expect(lastSubmittedData.filing_phone_number).toBe('15551234567')
      expect(lastSubmittedData.filing_phone_type).toBe('cell')
    })

    it('throws BadRequestException when federal candidate is missing fecCommitteeId', async () => {
      const campaign = createMockCampaign({
        details: {
          electionDate: '2024-11-05',
          ballotLevel: BallotReadyPositionLevel.FEDERAL,
        },
      })

      const tcrComplianceInput = {
        email: 'candidate@example.com',
        ein: '12-3456789',
        phone: '15551234567',
        peerlyIdentityId: 'peerly-123',
        filingUrl: 'https://fec.gov/filing/123',
        officeLevel: OfficeLevel.federal,
        fecCommitteeId: null,
        committeeType: CommitteeType.HOUSE,
      }

      await expect(
        service.submitCampaignVerifyRequest(
          tcrComplianceInput,
          baseUser,
          campaign,
          baseDomain,
        ),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('submit10DlcBrand', () => {
    const baseTcrPayload = {
      phone: '+15551234567',
      websiteDomain: 'https://janedoe.com',
      ein: '12-3456789',
    }

    it('includes jobAreas with didState and didNpaSubset when area codes are resolved', async () => {
      const areaCodeService = module.get(AreaCodeFromZipService)
      vi.mocked(areaCodeService.getAreaCodeFromZip).mockResolvedValue([
        '217',
        '618',
      ])

      const campaign = createMockCampaign({
        details: { campaignCommittee: 'Jane for Springfield' },
      })

      await service.submit10DlcBrand(
        'peerly-123',
        baseTcrPayload as never,
        campaign,
        baseDomain,
      )

      expect(lastSubmittedData.jobAreas).toEqual([
        {
          didState: 'IL',
          didNpaSubset: ['217', '618'],
        },
      ])
    })

    it('includes jobAreas with only didState when area code lookup returns empty', async () => {
      const areaCodeService = module.get(AreaCodeFromZipService)
      vi.mocked(areaCodeService.getAreaCodeFromZip).mockResolvedValue([])

      const campaign = createMockCampaign({
        details: { campaignCommittee: 'Jane for Springfield' },
      })

      await service.submit10DlcBrand(
        'peerly-123',
        baseTcrPayload as never,
        campaign,
        baseDomain,
      )

      // jobAreas is present with didState even when no area codes resolved
      expect(lastSubmittedData.jobAreas).toEqual([{ didState: 'IL' }])
    })

    it('includes jobAreas with only didState when area code lookup returns null', async () => {
      const areaCodeService = module.get(AreaCodeFromZipService)
      vi.mocked(areaCodeService.getAreaCodeFromZip).mockResolvedValue(null)

      const campaign = createMockCampaign({
        details: { campaignCommittee: 'Jane for Springfield' },
      })

      await service.submit10DlcBrand(
        'peerly-123',
        baseTcrPayload as never,
        campaign,
        baseDomain,
      )

      expect(lastSubmittedData.jobAreas).toEqual([{ didState: 'IL' }])
    })

    it('sends state in both top-level field and jobAreas when geography is resolved', async () => {
      const areaCodeService = module.get(AreaCodeFromZipService)
      vi.mocked(areaCodeService.getAreaCodeFromZip).mockResolvedValue([])

      const campaign = createMockCampaign({
        details: { campaignCommittee: 'Jane for Springfield' },
      })

      await service.submit10DlcBrand(
        'peerly-123',
        baseTcrPayload as never,
        campaign,
        baseDomain,
      )

      // state at top level from extractAddressComponents
      expect(lastSubmittedData.state).toBe('IL')
      // state also in jobAreas for DID routing
      const jobAreas = lastSubmittedData.jobAreas as Array<{
        didState: string
      }>
      expect(jobAreas[0].didState).toBe('IL')
    })

    it('omits jobAreas when geography falls back to USA default', async () => {
      const placesService = module.get(GooglePlacesService)
      vi.mocked(placesService.getAddressByPlaceId).mockResolvedValue({
        address_components: [],
      })
      const areaCodeService = module.get(AreaCodeFromZipService)
      vi.mocked(areaCodeService.getAreaCodeFromZip).mockResolvedValue([])

      const campaign = createMockCampaign({
        details: { campaignCommittee: 'Jane for Springfield' },
      })

      await service.submit10DlcBrand(
        'peerly-123',
        baseTcrPayload as never,
        campaign,
        baseDomain,
      )

      expect(lastSubmittedData).not.toHaveProperty('jobAreas')
    })

    it('throws BadRequestException when campaignCommittee is missing', async () => {
      const campaign = createMockCampaign({
        details: { electionDate: '2024-11-05' },
      })

      await expect(
        service.submit10DlcBrand(
          'peerly-123',
          baseTcrPayload as never,
          campaign,
          baseDomain,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('sends correctly formatted brand data fields', async () => {
      const areaCodeService = module.get(AreaCodeFromZipService)
      vi.mocked(areaCodeService.getAreaCodeFromZip).mockResolvedValue(['217'])

      const campaign = createMockCampaign({
        details: { campaignCommittee: 'Jane for Springfield' },
      })

      await service.submit10DlcBrand(
        'peerly-123',
        baseTcrPayload as never,
        campaign,
        baseDomain,
      )

      expect(lastSubmittedData.ein).toBe('12-3456789')
      expect(lastSubmittedData.is_political).toBe(true)
      expect(lastSubmittedData.state).toBe('IL')
      expect(lastSubmittedData.postalCode).toBe('62701')
      expect(lastSubmittedData.email).toBe('info@candidate.com')
    })
  })
})
