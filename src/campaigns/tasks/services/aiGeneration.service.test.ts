import { BadGatewayException, BadRequestException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiGenerationService } from './aiGeneration.service'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { S3Service } from 'src/vendors/aws/services/s3.service'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { GooglePlacesService } from '@/vendors/google/services/google-places.service'
import { CampaignTaskType } from '../campaignTasks.types'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { Campaign } from '@prisma/client'
import { GooglePlacesApiResponse } from '@/shared/types/GooglePlaces.types'

vi.mock('src/queue/queue.config', () => ({
  queueConfig: {
    name: 'test-queue',
    queueUrl: 'https://sqs.us-west-2.amazonaws.com/123/test-queue',
    region: 'us-west-2',
  },
  campaignPlanQueueConfig: {
    inputQueueUrl: 'https://sqs.us-west-2.amazonaws.com/123/test.fifo',
    resultsBucket: 'test-bucket',
  },
}))

const mockQueueProducer: Partial<QueueProducerService> = {
  sendToCampaignPlanQueue: vi.fn(),
}

const mockS3Service: Partial<S3Service> = {
  getFile: vi.fn(),
}

const mockOrganizationsService: Partial<OrganizationsService> = {
  resolvePositionNameByOrganizationSlug: vi.fn(),
}

const mockGooglePlacesService: Partial<GooglePlacesService> = {
  getAddressByPlaceId: vi.fn(),
}

const makeCampaign = (overrides: Partial<Campaign> = {}): Campaign =>
  ({
    id: 1,
    organizationSlug: 'campaign-1',
    placeId: null,
    details: {
      city: 'Boston',
      state: 'MA',
      electionDate: '2026-11-04',
      ballotLevel: 'CITY',
    },
    ...overrides,
  }) as Campaign

const placeResponseForCity = (city: string): GooglePlacesApiResponse => ({
  address_components: [
    {
      long_name: city,
      short_name: city,
      types: ['locality', 'political'],
    },
  ],
})

const validS3Payload = JSON.stringify({
  campaignId: 1,
  tasks: [
    {
      title: 'Town Hall Meeting',
      description: 'Meet voters at town hall',
      cta: 'Attend event',
      flowType: CampaignTaskType.events,
      week: 10,
      date: '2026-08-15',
      url: 'https://example.com/event',
    },
  ],
  taskCount: 1,
  generationTimestamp: '2026-04-08T00:00:00Z',
})

describe('AiGenerationService', () => {
  let service: AiGenerationService

  beforeEach(() => {
    vi.clearAllMocks()
    // Freeze time so assertions against hard-coded future dates (e.g. the 2026
    // electionDate in makeCampaign) stay stable after that date has passed in
    // real life. Fakes only Date — setTimeout/setInterval stay real.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'))
    vi.mocked(
      mockOrganizationsService.resolvePositionNameByOrganizationSlug!,
    ).mockResolvedValue('Mayor')
    service = new AiGenerationService(
      mockQueueProducer as QueueProducerService,
      mockS3Service as S3Service,
      mockOrganizationsService as OrganizationsService,
      mockGooglePlacesService as GooglePlacesService,
      createMockLogger(),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('triggerGeneration', () => {
    it('sends the full SQS payload with camelCase keys', async () => {
      await service.triggerGeneration({
        campaignId: 1,
        electionDate: '2026-11-04',
        state: 'MA',
        city: 'Boston',
        officeName: 'Mayor',
        officeLevel: 'CITY',
        primaryElectionDate: '2026-06-02',
      })

      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalledWith({
        campaignId: 1,
        electionDate: '2026-11-04',
        state: 'MA',
        city: 'Boston',
        officeName: 'Mayor',
        officeLevel: 'CITY',
        primaryElectionDate: '2026-06-02',
      })
    })

    it('sends nulls for missing optional fields', async () => {
      await service.triggerGeneration({
        campaignId: 1,
        electionDate: '2026-11-04',
        state: null,
        city: null,
        officeName: null,
        officeLevel: null,
        primaryElectionDate: null,
      })

      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: 1,
          electionDate: '2026-11-04',
          state: null,
          city: null,
          officeName: null,
          officeLevel: null,
          primaryElectionDate: null,
        }),
      )
    })

    it('throws BadRequestException when electionDate is missing', async () => {
      await expect(
        service.triggerGeneration({
          campaignId: 1,
          electionDate: '',
          state: 'MA',
          city: 'Boston',
          officeName: null,
          officeLevel: null,
          primaryElectionDate: null,
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockQueueProducer.sendToCampaignPlanQueue).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when electionDate is malformed', async () => {
      await expect(
        service.triggerGeneration({
          campaignId: 1,
          electionDate: 'not-a-date',
          state: 'MA',
          city: 'Boston',
          officeName: null,
          officeLevel: null,
          primaryElectionDate: null,
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockQueueProducer.sendToCampaignPlanQueue).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when electionDate has invalid calendar values', async () => {
      await expect(
        service.triggerGeneration({
          campaignId: 1,
          electionDate: '2026-13-45',
          state: 'MA',
          city: 'Boston',
          officeName: null,
          officeLevel: null,
          primaryElectionDate: null,
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockQueueProducer.sendToCampaignPlanQueue).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when primaryElectionDate is malformed', async () => {
      await expect(
        service.triggerGeneration({
          campaignId: 1,
          electionDate: '2026-11-04',
          state: 'MA',
          city: 'Boston',
          officeName: null,
          officeLevel: null,
          primaryElectionDate: 'not-a-date',
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockQueueProducer.sendToCampaignPlanQueue).not.toHaveBeenCalled()
    })

    it('accepts null primaryElectionDate and a valid YYYY-MM-DD value', async () => {
      await service.triggerGeneration({
        campaignId: 1,
        electionDate: '2026-11-04',
        state: 'MA',
        city: 'Boston',
        officeName: null,
        officeLevel: null,
        primaryElectionDate: '2026-06-02',
      })
      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalledWith(
        expect.objectContaining({ primaryElectionDate: '2026-06-02' }),
      )
    })

    // date-fns parse is lenient about zero-padding and trailing whitespace —
    // each case below would slip past a pure date-fns check but is rejected
    // by the regex guard.
    it.each([
      ['non-zero-padded month+day', '2026-1-4'],
      ['non-zero-padded day', '2026-11-4'],
      ['trailing whitespace', '2026-11-04 '],
      ['slash separator', '2026/11/04'],
      ['iso datetime', '2026-11-04T10:00:00'],
    ])('rejects electionDate with %s (%s)', async (_label, electionDate) => {
      await expect(
        service.triggerGeneration({
          campaignId: 1,
          electionDate,
          state: 'MA',
          city: 'Boston',
          officeName: null,
          officeLevel: null,
          primaryElectionDate: null,
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockQueueProducer.sendToCampaignPlanQueue).not.toHaveBeenCalled()
    })
  })

  describe('triggerEventGeneration', () => {
    it('builds full payload from campaign details + resolved officeName', async () => {
      const result = await service.triggerEventGeneration(makeCampaign())

      expect(result).toBe(true)
      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalledWith({
        campaignId: 1,
        electionDate: '2026-11-04',
        state: 'MA',
        city: 'Boston',
        officeName: 'Mayor',
        officeLevel: 'CITY',
        primaryElectionDate: null,
      })
    })

    it('includes primaryElectionDate when present', async () => {
      await service.triggerEventGeneration(
        makeCampaign({
          details: {
            city: 'Boston',
            state: 'MA',
            electionDate: '2026-11-04',
            ballotLevel: 'CITY',
            primaryElectionDate: '2026-06-02',
          },
        } as Partial<Campaign>),
      )

      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalledWith(
        expect.objectContaining({ primaryElectionDate: '2026-06-02' }),
      )
    })

    it('falls back to Google Places when details.city is missing but placeId is set', async () => {
      vi.mocked(mockGooglePlacesService.getAddressByPlaceId!).mockResolvedValue(
        placeResponseForCity('Cambridge'),
      )
      const campaign = makeCampaign({
        placeId: 'ChIJexample',
        details: { state: 'MA', electionDate: '2026-11-04' },
      } as Partial<Campaign>)

      await service.triggerEventGeneration(campaign)

      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Cambridge' }),
      )
    })

    it('sends null city when details.city is missing and there is no placeId', async () => {
      const campaign = makeCampaign({
        placeId: null,
        details: { state: 'MA', electionDate: '2026-11-04' },
      } as Partial<Campaign>)

      await service.triggerEventGeneration(campaign)

      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalledWith(
        expect.objectContaining({ city: null }),
      )
    })

    it('trims whitespace around details.city before sending', async () => {
      const campaign = makeCampaign({
        details: {
          city: '  Boston  ',
          state: 'MA',
          electionDate: '2026-11-04',
        },
      } as Partial<Campaign>)

      await service.triggerEventGeneration(campaign)

      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Boston' }),
      )
    })

    it('sends null city when Google Places call fails', async () => {
      vi.mocked(mockGooglePlacesService.getAddressByPlaceId!).mockRejectedValue(
        new Error('Places API down'),
      )
      const campaign = makeCampaign({
        placeId: 'ChIJexample',
        details: { state: 'MA', electionDate: '2026-11-04' },
      } as Partial<Campaign>)

      const result = await service.triggerEventGeneration(campaign)

      expect(result).toBe(true)
      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalledWith(
        expect.objectContaining({ city: null }),
      )
    })

    it('sends null officeName when organization resolver throws', async () => {
      vi.mocked(
        mockOrganizationsService.resolvePositionNameByOrganizationSlug!,
      ).mockRejectedValue(new Error('election-api unreachable'))

      const result = await service.triggerEventGeneration(makeCampaign())

      expect(result).toBe(true)
      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalledWith(
        expect.objectContaining({ officeName: null }),
      )
    })

    it('sends null officeName when organizationSlug is missing', async () => {
      const campaign = makeCampaign({
        organizationSlug: '',
      } as Partial<Campaign>)

      await service.triggerEventGeneration(campaign)

      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalledWith(
        expect.objectContaining({ officeName: null }),
      )
    })

    it('sends null officeLevel when ballotLevel is missing', async () => {
      const campaign = makeCampaign({
        details: { city: 'Boston', state: 'MA', electionDate: '2026-11-04' },
      } as Partial<Campaign>)

      await service.triggerEventGeneration(campaign)

      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalledWith(
        expect.objectContaining({ officeLevel: null }),
      )
    })

    it('returns false when SQS send fails', async () => {
      vi.mocked(mockQueueProducer.sendToCampaignPlanQueue!).mockRejectedValue(
        new Error('SQS down'),
      )

      const result = await service.triggerEventGeneration(makeCampaign())

      expect(result).toBe(false)
    })

    it('returns false without sending when election date is in the past', async () => {
      const campaign = makeCampaign({
        details: { city: 'Boston', state: 'MA', electionDate: '2020-11-03' },
      } as Partial<Campaign>)

      const result = await service.triggerEventGeneration(campaign)

      expect(result).toBe(false)
      expect(mockQueueProducer.sendToCampaignPlanQueue).not.toHaveBeenCalled()
    })

    it('returns false without sending when election date is missing', async () => {
      const campaign = makeCampaign({
        details: { city: 'Boston', state: 'MA' },
      } as Partial<Campaign>)

      const result = await service.triggerEventGeneration(campaign)

      expect(result).toBe(false)
      expect(mockQueueProducer.sendToCampaignPlanQueue).not.toHaveBeenCalled()
    })
  })

  describe('readResultFromS3', () => {
    it('reads and parses valid S3 payload', async () => {
      vi.mocked(mockS3Service.getFile!).mockResolvedValue(validS3Payload)

      const result = await service.readResultFromS3('results/1/test.json')

      expect(result.campaignId).toBe(1)
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].title).toBe('Town Hall Meeting')
    })

    it('throws when file not found in S3', async () => {
      vi.mocked(mockS3Service.getFile!).mockResolvedValue(undefined)

      await expect(
        service.readResultFromS3('results/1/missing.json'),
      ).rejects.toThrow(BadGatewayException)
    })

    it('throws when payload is invalid JSON', async () => {
      vi.mocked(mockS3Service.getFile!).mockResolvedValue('not json')

      await expect(
        service.readResultFromS3('results/1/bad.json'),
      ).rejects.toThrow(BadGatewayException)
    })

    it('throws when payload does not match schema', async () => {
      vi.mocked(mockS3Service.getFile!).mockResolvedValue(
        JSON.stringify({ wrong: 'shape' }),
      )

      await expect(
        service.readResultFromS3('results/1/bad-schema.json'),
      ).rejects.toThrow(BadGatewayException)
    })
  })

  describe('parseCompletionResult', () => {
    it('reads S3 and returns parsed tasks', async () => {
      vi.mocked(mockS3Service.getFile!).mockResolvedValue(validS3Payload)

      const { campaignId, tasks } = await service.parseCompletionResult({
        campaignId: 1,
        status: 'completed',
        s3Key: 'results/1/test.json',
        taskCount: 1,
        generationTimestamp: '2026-04-08T00:00:00Z',
      })

      expect(campaignId).toBe(1)
      expect(tasks).toHaveLength(1)
      expect(tasks[0]).toEqual(
        expect.objectContaining({
          title: 'Town Hall Meeting',
          flowType: CampaignTaskType.events,
          link: 'https://example.com/event',
        }),
      )
    })
  })

  describe('parseLambdaResultToTasks', () => {
    it('maps Lambda output to CampaignTask format', () => {
      const result = service.parseLambdaResultToTasks(
        {
          campaignId: 1,
          tasks: [
            {
              title: 'Event',
              description: 'Desc',
              cta: 'Go',
              flowType: CampaignTaskType.events,
              week: 5,
              date: '2026-09-01',
              url: 'https://example.com',
            },
          ],
          taskCount: 1,
          generationTimestamp: '2026-04-08T00:00:00Z',
        },
        42,
      )

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Event')
      expect(result[0].flowType).toBe(CampaignTaskType.events)
      expect(result[0].link).toBe('https://example.com')
      expect(result[0].id).toMatch(/^event-42-0-/)
    })

    it('throws on unknown flowType via Zod parsing', async () => {
      const payloadWithBadFlowType = JSON.stringify({
        campaignId: 1,
        tasks: [
          {
            title: 'Event',
            description: 'Desc',
            cta: 'Go',
            flowType: 'unknown_type',
            week: 1,
            date: '2026-09-01',
          },
        ],
        taskCount: 1,
        generationTimestamp: '2026-04-08T00:00:00Z',
      })
      vi.mocked(mockS3Service.getFile!).mockResolvedValue(
        payloadWithBadFlowType,
      )

      await expect(
        service.readResultFromS3('results/1/test.json'),
      ).rejects.toThrow(BadGatewayException)
    })

    it('maps url to link, undefined when absent', () => {
      const result = service.parseLambdaResultToTasks(
        {
          campaignId: 1,
          tasks: [
            {
              title: 'No URL',
              description: 'Desc',
              cta: 'Go',
              flowType: CampaignTaskType.events,
              week: 1,
              date: '2026-09-01',
            },
          ],
          taskCount: 1,
          generationTimestamp: '2026-04-08T00:00:00Z',
        },
        1,
      )

      expect(result[0]).toEqual({
        id: 'event-1-0-2026-04-08T00:00:00Z',
        title: 'No URL',
        description: 'Desc',
        cta: 'Go',
        flowType: CampaignTaskType.events,
        week: 1,
        date: '2026-09-01',
        link: undefined,
        proRequired: false,
      })
    })
  })
})
