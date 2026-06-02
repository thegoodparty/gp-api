import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { HubspotService } from '@/crm/hubspot.service'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CrmCampaignsService } from './crmCampaigns.service'
import { CampaignsService } from './campaigns.service'

describe('CrmCampaignsService.trackCampaign', () => {
  const findUniqueOrThrow = vi.fn()
  const errorMessage = vi.fn()

  const buildService = (isConfigured: boolean) =>
    new CrmCampaignsService(
      { findUniqueOrThrow } as unknown as CampaignsService,
      {} as never,
      { isConfigured } as unknown as HubspotService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { errorMessage } as unknown as SlackService,
      {} as never,
      createMockLogger(),
    )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips all HubSpot work and alerts when HubSpot is not configured', async () => {
    const result = await buildService(false).trackCampaign(123)

    expect(result).toBeUndefined()
    expect(findUniqueOrThrow).not.toHaveBeenCalled()
    expect(errorMessage).not.toHaveBeenCalled()
  })

  it('proceeds to load the campaign when HubSpot is configured', async () => {
    findUniqueOrThrow.mockRejectedValueOnce(new Error('stop here'))

    await expect(buildService(true).trackCampaign(123)).rejects.toThrow(
      'stop here',
    )
    expect(findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 123 } })
  })
})
