import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { AiContentController } from './aiContent.controller'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

const mockCampaigns = { update: vi.fn() }

const controller = new AiContentController(
  {} as never,
  {} as never,
  mockCampaigns as never,
  {} as never,
  {} as never,
  {} as never,
  createMockLogger(),
)

const campaignWith = (aiContent: Record<string, unknown>) =>
  ({ id: 1, aiContent }) as unknown as Campaign

describe('AiContentController.delete', () => {
  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects forbidden key: %s',
    async (key) => {
      await expect(controller.delete(campaignWith({}), key)).rejects.toThrow(
        BadRequestException,
      )
    },
  )

  it('throws NotFoundException when key is not in aiContent', async () => {
    await expect(
      controller.delete(campaignWith({}), 'missing'),
    ).rejects.toThrow(NotFoundException)
  })

  it('deletes a valid key from aiContent', async () => {
    const campaign = campaignWith({ bio: { name: 'Bio' } })
    mockCampaigns.update.mockResolvedValue(campaign)

    await controller.delete(campaign, 'bio')

    expect(mockCampaigns.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        aiContent: expect.not.objectContaining({ bio: expect.anything() }),
      },
    })
  })
})
