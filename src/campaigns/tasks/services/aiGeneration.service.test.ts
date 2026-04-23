import { BadGatewayException, BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiGenerationService } from './aiGeneration.service'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { S3Service } from 'src/vendors/aws/services/s3.service'
import { CampaignTaskType } from '../campaignTasks.types'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { Campaign } from '@prisma/client'

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

const makeCampaign = (overrides: Partial<Campaign> = {}): Campaign =>
  ({
    id: 1,
    details: {
      city: 'Boston',
      state: 'MA',
      electionDate: '2026-11-04',
    },
    ...overrides,
  }) as Campaign

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
    service = new AiGenerationService(
      mockQueueProducer as QueueProducerService,
      mockS3Service as S3Service,
      createMockLogger(),
    )
  })

  describe('triggerGeneration', () => {
    it('sends SQS message with correct params', async () => {
      await service.triggerGeneration({
        campaignId: 1,
        electionDate: '2026-11-04',
        city: 'Boston',
        state: 'MA',
      })

      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalledWith({
        campaignId: 1,
        election_date: '2026-11-04',
        city: 'Boston',
        state: 'MA',
      })
    })

    it('throws BadRequestException when city is missing', async () => {
      await expect(
        service.triggerGeneration({
          campaignId: 1,
          electionDate: '2026-11-04',
          city: '',
          state: 'MA',
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when state is missing', async () => {
      await expect(
        service.triggerGeneration({
          campaignId: 1,
          electionDate: '2026-11-04',
          city: 'Boston',
          state: '',
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when electionDate is missing', async () => {
      await expect(
        service.triggerGeneration({
          campaignId: 1,
          electionDate: '',
          city: 'Boston',
          state: 'MA',
        }),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('triggerEventGeneration', () => {
    it('returns true when triggered successfully', async () => {
      const result = await service.triggerEventGeneration(makeCampaign())

      expect(result).toBe(true)
      expect(mockQueueProducer.sendToCampaignPlanQueue).toHaveBeenCalled()
    })

    it('returns false when city is missing', async () => {
      const campaign = makeCampaign({
        details: { state: 'MA', electionDate: '2026-11-04' },
      } as Partial<Campaign>)

      const result = await service.triggerEventGeneration(campaign)

      expect(result).toBe(false)
      expect(mockQueueProducer.sendToCampaignPlanQueue).not.toHaveBeenCalled()
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

      expect(result[0].link).toBeUndefined()
    })
  })
})
