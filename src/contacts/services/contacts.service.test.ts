import { BadRequestException } from '@nestjs/common'
import { of } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignWithPathToVictory } from '../contacts.types'
import { ContactsService } from './contacts.service'

vi.mock('@nestjs/axios', () => ({
  HttpService: vi.fn(),
}))

describe('ContactsService', () => {
  let service: ContactsService
  let mockHttpService: {
    post: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
  }
  let mockVoterFileFilterService: {
    findByIdAndCampaignId: ReturnType<typeof vi.fn>
  }
  let mockElectionsService: { cleanDistrictName: ReturnType<typeof vi.fn> }
  let mockCampaignsService: { updateJsonFields: ReturnType<typeof vi.fn> }
  let mockElectedOfficeService: {
    getCurrentElectedOffice: ReturnType<typeof vi.fn>
  }

  const baseCampaign = {
    id: 1,
    userId: 100,
    isPro: false,
    details: { state: 'NC' },
    pathToVictory: {
      data: { electionType: 'district', electionLocation: 'District 1' },
    },
  } as unknown as CampaignWithPathToVictory

  beforeEach(() => {
    mockHttpService = {
      post: vi
        .fn()
        .mockReturnValue(of({ data: { people: [], pagination: {} } })),
      get: vi.fn(),
    }
    mockVoterFileFilterService = {
      findByIdAndCampaignId: vi.fn().mockResolvedValue(null),
    }
    mockElectionsService = {
      cleanDistrictName: vi.fn((name: string) => name),
    }
    mockCampaignsService = {
      updateJsonFields: vi.fn().mockResolvedValue(undefined),
    }
    mockElectedOfficeService = {
      getCurrentElectedOffice: vi.fn().mockResolvedValue(null),
    }

    service = new ContactsService(
      mockHttpService as never,
      mockVoterFileFilterService as never,
      mockElectionsService as never,
      mockCampaignsService as never,
      mockElectedOfficeService as never,
    )
    vi.clearAllMocks()
  })

  describe('findContacts (search)', () => {
    it('throws BadRequestException when search is used and campaign is not pro and user has no elected office', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      const campaign = { ...baseCampaign, isPro: false }

      await expect(
        service.findContacts(
          { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
          campaign,
        ),
      ).rejects.toThrow(BadRequestException)
      await expect(
        service.findContacts(
          { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
          campaign,
        ),
      ).rejects.toThrow('Search is only available for pro campaigns')

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
    })

    it('does not throw when search is used and campaign is pro', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      const campaign = { ...baseCampaign, isPro: true }

      await expect(
        service.findContacts(
          { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
          campaign,
        ),
      ).resolves.toBeDefined()

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
    })

    it('does not throw when search is used and user has elected office', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue({
        id: 'office-1',
        userId: 100,
        isActive: true,
      })
      const campaign = { ...baseCampaign, isPro: false }

      await expect(
        service.findContacts(
          { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
          campaign,
        ),
      ).resolves.toBeDefined()

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
    })
  })

  describe('contact data redaction', () => {
    const mockPersonOutput = {
      id: 'person-1',
      lalVoterId: 'LAL123',
      firstName: 'John',
      middleName: 'A',
      lastName: 'Doe',
      nameSuffix: null,
      age: 35,
      state: 'NC',
      address: {
        line1: '123 Main St',
        line2: 'Apt 4',
        city: 'Raleigh',
        state: 'NC',
        zip: '27601',
        zipPlus4: '1234',
        latitude: '35.7796',
        longitude: '-78.6382',
      },
      cellPhone: '555-123-4567',
      landline: '555-987-6543',
      gender: 'Male' as const,
      politicalParty: 'Independent' as const,
      registeredVoter: 'Yes' as const,
      estimatedIncomeAmount: 75000,
      voterStatus: 'Likely' as const,
      maritalStatus: 'Married' as const,
      hasChildrenUnder18: 'Yes' as const,
      veteranStatus: null,
      homeowner: 'Yes' as const,
      businessOwner: null,
      levelOfEducation: 'College Degree' as const,
      ethnicityGroup: 'European' as const,
      language: 'English' as const,
    }

    it('redacts sensitive contact info when campaign is not pro and user has no elected office', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            pagination: {
              totalResults: 1,
              currentPage: 1,
              pageSize: 10,
              totalPages: 1,
              hasNextPage: false,
              hasPreviousPage: false,
            },
            people: [mockPersonOutput],
          },
        }),
      )
      const campaign = { ...baseCampaign, isPro: false }

      const result = await service.findContacts(
        { resultsPerPage: 10, page: 1, segment: 'all' },
        campaign,
      )

      // Should have redacted sensitive data
      expect(result.people[0].cellPhone).toBeNull()
      expect(result.people[0].landline).toBeNull()
      expect(result.people[0].address.line1).toBeNull()
      expect(result.people[0].address.line2).toBeNull()
      expect(result.people[0].address.zipPlus4).toBeNull()
      expect(result.people[0].address.latitude).toBeNull()
      expect(result.people[0].address.longitude).toBeNull()

      // Non-sensitive data should still be present
      expect(result.people[0].firstName).toBe('John')
      expect(result.people[0].lastName).toBe('Doe')
      expect(result.people[0].age).toBe(35)
      expect(result.people[0].address.city).toBe('Raleigh')
      expect(result.people[0].address.state).toBe('NC')
      expect(result.people[0].address.zip).toBe('27601')
    })

    it('returns full contact info when campaign is pro', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            pagination: {
              totalResults: 1,
              currentPage: 1,
              pageSize: 10,
              totalPages: 1,
              hasNextPage: false,
              hasPreviousPage: false,
            },
            people: [mockPersonOutput],
          },
        }),
      )
      const campaign = { ...baseCampaign, isPro: true }

      const result = await service.findContacts(
        { resultsPerPage: 10, page: 1, segment: 'all' },
        campaign,
      )

      // Full data should be present
      expect(result.people[0].cellPhone).toBe('555-123-4567')
      expect(result.people[0].landline).toBe('555-987-6543')
      expect(result.people[0].address.line1).toBe('123 Main St')
      expect(result.people[0].address.line2).toBe('Apt 4')
      expect(result.people[0].address.zipPlus4).toBe('1234')
      expect(result.people[0].address.latitude).toBe('35.7796')
      expect(result.people[0].address.longitude).toBe('-78.6382')
    })

    it('returns full contact info when user has elected office', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue({
        id: 'office-1',
        userId: 100,
        isActive: true,
      })
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            pagination: {
              totalResults: 1,
              currentPage: 1,
              pageSize: 10,
              totalPages: 1,
              hasNextPage: false,
              hasPreviousPage: false,
            },
            people: [mockPersonOutput],
          },
        }),
      )
      const campaign = { ...baseCampaign, isPro: false }

      const result = await service.findContacts(
        { resultsPerPage: 10, page: 1, segment: 'all' },
        campaign,
      )

      // Full data should be present
      expect(result.people[0].cellPhone).toBe('555-123-4567')
      expect(result.people[0].landline).toBe('555-987-6543')
      expect(result.people[0].address.line1).toBe('123 Main St')
    })

    it('redacts sensitive info when getting single person for non-pro campaign', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      mockHttpService.get.mockReturnValue(of({ data: mockPersonOutput }))
      const campaign = { ...baseCampaign, isPro: false }

      const result = await service.findPerson('person-1', campaign)

      // Should have redacted sensitive data
      expect(result.cellPhone).toBeNull()
      expect(result.landline).toBeNull()
      expect(result.address.line1).toBeNull()
      expect(result.address.line2).toBeNull()
      expect(result.address.zipPlus4).toBeNull()
      expect(result.address.latitude).toBeNull()
      expect(result.address.longitude).toBeNull()

      // Non-sensitive data should still be present
      expect(result.firstName).toBe('John')
      expect(result.lastName).toBe('Doe')
      expect(result.address.city).toBe('Raleigh')
      expect(result.address.state).toBe('NC')
      expect(result.address.zip).toBe('27601')
    })

    it('returns full person data when campaign is pro', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      mockHttpService.get.mockReturnValue(of({ data: mockPersonOutput }))
      const campaign = { ...baseCampaign, isPro: true }

      const result = await service.findPerson('person-1', campaign)

      // Full data should be present
      expect(result.cellPhone).toBe('555-123-4567')
      expect(result.landline).toBe('555-987-6543')
      expect(result.address.line1).toBe('123 Main St')
      expect(result.address.line2).toBe('Apt 4')
    })
  })

  describe('downloadContacts', () => {
    it('throws BadRequestException when campaign is not pro and user has no elected office', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      const campaign = { ...baseCampaign, isPro: false }
      const res = { raw: {} } as never

      await expect(
        service.downloadContacts({ segment: 'all' }, campaign, res),
      ).rejects.toThrow(BadRequestException)
      await expect(
        service.downloadContacts({ segment: 'all' }, campaign, res),
      ).rejects.toThrow('Campaign is not pro')

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
    })

    it('does not throw when campaign is pro', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      const campaign = { ...baseCampaign, isPro: true }
      const mockStream = {
        pipe: vi.fn(),
        on: vi.fn((event: string, cb: () => void) => {
          if (event === 'end') setImmediate(cb)
        }),
      }
      mockHttpService.post.mockReturnValue(of({ data: mockStream }))
      const res = { raw: {} } as never

      await expect(
        service.downloadContacts({ segment: 'all' }, campaign, res),
      ).resolves.toBeUndefined()

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
    })

    it('does not throw when user has elected office', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue({
        id: 'office-1',
        userId: 100,
        isActive: true,
      })
      const campaign = { ...baseCampaign, isPro: false }
      const mockStream = {
        pipe: vi.fn(),
        on: vi.fn((event: string, cb: () => void) => {
          if (event === 'end') setImmediate(cb)
        }),
      }
      mockHttpService.post.mockReturnValue(of({ data: mockStream }))
      const res = { raw: {} } as never

      await expect(
        service.downloadContacts({ segment: 'all' }, campaign, res),
      ).resolves.toBeUndefined()

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
    })
  })
})
