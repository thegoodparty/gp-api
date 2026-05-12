import { Test, TestingModule } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { RequestMethod } from '@nestjs/common'
import { DomainStatus, WebsiteStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainsController } from './domains.controller'
import { DomainsService } from '../services/domains.service'
import { WebsitesService } from '../services/websites.service'
import { UseCampaignGuard } from 'src/campaigns/guards/UseCampaign.guard'
import { REQUIRE_CAMPAIGN_META_KEY } from 'src/campaigns/decorators/UseCampaign.decorator'
import {
  createMockCampaign,
  createMockUser,
} from '@/shared/test-utils/mockData.util'

describe('DomainsController.searchDomains', () => {
  let controller: DomainsController
  let mockDomains: { searchDomainsForCampaign: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockDomains = {
      searchDomainsForCampaign: vi.fn().mockResolvedValue({
        candidates: [{ domain: 'vote-oneill.run', price: 8 }],
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DomainsController],
      providers: [
        { provide: DomainsService, useValue: mockDomains },
        { provide: WebsitesService, useValue: {} },
      ],
    })
      .overrideGuard(UseCampaignGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<DomainsController>(DomainsController)
  })

  it('delegates to DomainsService.searchDomainsForCampaign and returns its result', async () => {
    const campaign = {
      ...createMockCampaign({ details: { electionDate: '2026-11-03' } }),
      user: createMockUser({ firstName: 'Mary', lastName: "O'Neill" }),
    }

    const result = await controller.searchDomains(campaign, {
      patterns: ['vote-{last_name}.run'],
      maxPrice: 10,
    })

    expect(mockDomains.searchDomainsForCampaign).toHaveBeenCalledWith(
      campaign,
      ['vote-{last_name}.run'],
      10,
    )
    expect(result).toEqual({
      candidates: [{ domain: 'vote-oneill.run', price: 8 }],
    })
  })

  it('handler is registered for POST /search with @UseCampaign() including user', () => {
    const reflector = new Reflector()

    const path = Reflect.getMetadata('path', controller.searchDomains)
    const method = Reflect.getMetadata('method', controller.searchDomains)
    expect(path).toBe('search')
    expect(method).toBe(RequestMethod.POST)

    const meta = reflector.get(
      REQUIRE_CAMPAIGN_META_KEY,
      controller.searchDomains,
    )
    expect(meta).toBeDefined()
    expect(meta.include).toEqual({ user: true })
  })
})

describe('DomainsController.purchaseDomain', () => {
  let controller: DomainsController
  let mockDomains: { purchaseDomainForCampaign: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockDomains = {
      purchaseDomainForCampaign: vi.fn().mockResolvedValue({
        website: {
          id: 10,
          vanityPath: 'mary-oneill',
          status: WebsiteStatus.unpublished,
          campaignId: 42,
        },
        domain: {
          id: 1,
          name: 'vote-oneill.run',
          status: DomainStatus.pending,
          price: 12,
        },
        alreadyExisted: false,
        message: 'Domain registration initiated with Vercel',
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DomainsController],
      providers: [
        { provide: DomainsService, useValue: mockDomains },
        { provide: WebsitesService, useValue: {} },
      ],
    })
      .overrideGuard(UseCampaignGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<DomainsController>(DomainsController)
  })

  it('delegates to DomainsService.purchaseDomainForCampaign and returns its result', async () => {
    const campaign = {
      ...createMockCampaign({ id: 42 }),
      user: createMockUser({ firstName: 'Mary', lastName: "O'Neill" }),
    }

    const result = await controller.purchaseDomain(campaign, {
      domain: 'vote-oneill.run',
    })

    expect(mockDomains.purchaseDomainForCampaign).toHaveBeenCalledWith(
      campaign,
      'vote-oneill.run',
    )
    expect(result.domain.name).toBe('vote-oneill.run')
    expect(result.alreadyExisted).toBe(false)
  })

  it('handler is registered for POST /purchase with @UseCampaign() including user', () => {
    const reflector = new Reflector()

    const path = Reflect.getMetadata('path', controller.purchaseDomain)
    const method = Reflect.getMetadata('method', controller.purchaseDomain)
    expect(path).toBe('purchase')
    expect(method).toBe(RequestMethod.POST)

    const meta = reflector.get(
      REQUIRE_CAMPAIGN_META_KEY,
      controller.purchaseDomain,
    )
    expect(meta).toBeDefined()
    expect(meta.include).toEqual({ user: true })
  })
})
