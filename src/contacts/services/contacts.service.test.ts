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
  let mockHttpService: { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> }
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
      post: vi.fn().mockReturnValue(of({ data: { people: [], pagination: {} } })),
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

      expect(mockElectedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        campaign.userId,
      )
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

      expect(mockElectedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        campaign.userId,
      )
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

      expect(mockElectedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        campaign.userId,
      )
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

      expect(mockElectedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        campaign.userId,
      )
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

      expect(mockElectedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        campaign.userId,
      )
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

      expect(mockElectedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        campaign.userId,
      )
    })
  })
})
