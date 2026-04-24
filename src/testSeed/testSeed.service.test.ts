import { NotFoundException } from '@nestjs/common'
import { Campaign, TcrCompliance, TcrComplianceStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaService } from '@/prisma/prisma.service'
import { SeedCampaignSchema } from './schemas/seedCampaign.schema'
import { TestSeedService } from './testSeed.service'

describe('TestSeedService', () => {
  let service: TestSeedService
  let prisma: {
    campaign: {
      findFirst: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }
    tcrCompliance: {
      upsert: ReturnType<typeof vi.fn>
    }
  }

  beforeEach(() => {
    prisma = {
      campaign: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      tcrCompliance: {
        upsert: vi.fn(),
      },
    }

    service = new TestSeedService(prisma as unknown as PrismaService)
  })

  it('throws when the campaign does not belong to the authenticated user', async () => {
    prisma.campaign.findFirst.mockResolvedValue(null)

    await expect(
      service.seedCampaign(42, {
        campaignId: 99,
        isPro: true,
      } as SeedCampaignSchema),
    ).rejects.toThrow(NotFoundException)

    expect(prisma.campaign.findFirst).toHaveBeenCalledWith({
      where: { id: 99, userId: 42 },
      select: { id: true },
    })
    expect(prisma.campaign.update).not.toHaveBeenCalled()
    expect(prisma.tcrCompliance.upsert).not.toHaveBeenCalled()
  })

  it("only seeds the authenticated user's owned campaign", async () => {
    prisma.campaign.findFirst.mockResolvedValue({ id: 99 })
    prisma.campaign.update.mockResolvedValue({ id: 99 } as Campaign)
    prisma.tcrCompliance.upsert.mockResolvedValue({
      campaignId: 99,
      status: TcrComplianceStatus.approved,
    } as TcrCompliance)

    const result = await service.seedCampaign(42, {
      campaignId: 99,
      isPro: true,
      hasFreeTextsOffer: true,
      tcrComplianceStatus: TcrComplianceStatus.approved,
    } as SeedCampaignSchema)

    expect(prisma.campaign.findFirst).toHaveBeenCalledWith({
      where: { id: 99, userId: 42 },
      select: { id: true },
    })
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: {
        isPro: true,
        isVerified: true,
        hasFreeTextsOffer: true,
      },
    })
    expect(prisma.tcrCompliance.upsert).toHaveBeenCalledWith({
      where: { campaignId: 99 },
      update: { status: TcrComplianceStatus.approved },
      create: expect.objectContaining({
        campaignId: 99,
        status: TcrComplianceStatus.approved,
      }),
    })
    expect(result).toMatchObject({
      campaign: { id: 99 },
      tcrCompliance: {
        campaignId: 99,
        status: TcrComplianceStatus.approved,
      },
    })
  })
})
