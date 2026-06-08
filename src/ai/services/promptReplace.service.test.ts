import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import {
  PromptReplaceCampaign,
  PromptReplaceService,
} from './promptReplace.service'

const makeCampaign = (
  details: Record<string, unknown> = {},
): PromptReplaceCampaign =>
  ({
    id: 1,
    organizationSlug: null,
    user: { id: 1, firstName: 'Jane', lastName: 'Doe' },
    details: { district: 'City Council Ward 2', ...details },
    campaignPositions: [],
    campaignUpdateHistory: [],
    aiContent: null,
  }) as unknown as PromptReplaceCampaign

describe('PromptReplaceService district token', () => {
  let service: PromptReplaceService

  beforeEach(() => {
    const organizations = {
      findUnique: vi.fn(),
      resolvePositionNameByOrganizationSlug: vi.fn(),
    }
    service = new PromptReplaceService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      organizations as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createMockLogger() as any,
    )
  })

  it('replaces [[l2DistrictName]] with the resolved voter-file district name', async () => {
    const result = await service.promptReplace(
      'You represent [[l2DistrictName]].',
      makeCampaign(),
      null,
      'STATE HOUSE 005',
    )
    expect(result).toContain('You represent STATE HOUSE 005.')
  })

  it('falls back to the self-reported district when no L2 name is resolved', async () => {
    const result = await service.promptReplace(
      'You represent [[l2DistrictName]].',
      makeCampaign(),
      null,
      null,
    )
    expect(result).toContain('You represent City Council Ward 2.')
  })
})
