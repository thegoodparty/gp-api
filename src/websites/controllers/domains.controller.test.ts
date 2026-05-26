import { Test, TestingModule } from '@nestjs/testing'
import { DiscoveryModule, HttpAdapterHost, Reflector } from '@nestjs/core'
import {
  ConflictException,
  HttpStatus,
  ModuleMetadata,
  RequestMethod,
} from '@nestjs/common'
import { DomainStatus } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainsController } from './domains.controller'
import { DomainsService } from '../services/domains.service'
import { WebsitesService } from '../services/websites.service'
import { UseCampaignGuard } from 'src/campaigns/guards/UseCampaign.guard'
import { REQUIRE_CAMPAIGN_META_KEY } from 'src/campaigns/decorators/UseCampaign.decorator'
import { MCP_TOOL_KEY } from '@/mcp/decorators/McpTool.decorator'
import { McpServerService } from '@/mcp/services/mcpServer.service'
import {
  PurchaseDomainBodySchema,
  PurchaseDomainResponseSchema,
} from '../schemas/PurchaseDomain.schema'
import {
  createMockCampaign,
  createMockUser,
} from '@/shared/test-utils/mockData.util'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

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
          id: 42,
          vanityPath: 'jane-for-senate',
          status: 'unpublished',
          campaignId: 7,
        },
        domain: {
          id: 99,
          name: 'voteforjane.run',
          status: DomainStatus.pending,
          price: 8,
        },
        alreadyExisted: false,
        message:
          'Domain reserved; registration will complete after payment confirmation',
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

  it('delegates to DomainsService.purchaseDomainForCampaign and narrows the response (drops website)', async () => {
    const campaign = {
      ...createMockCampaign({ details: { electionDate: '2026-11-03' } }),
      user: createMockUser({ firstName: 'Jane', lastName: 'Doe' }),
    }

    const result = await controller.purchaseDomain(campaign, {
      domain: 'voteforjane.run',
    })

    expect(mockDomains.purchaseDomainForCampaign).toHaveBeenCalledWith(
      campaign,
      'voteforjane.run',
    )
    expect(result).toEqual({
      domain: {
        id: 99,
        name: 'voteforjane.run',
        status: DomainStatus.pending,
        price: 8,
      },
      alreadyExisted: false,
      message:
        'Domain reserved; registration will complete after payment confirmation',
    })
    expect(result).not.toHaveProperty('website')
  })

  it('propagates ConflictException from the service when the domain is no longer available', async () => {
    mockDomains.purchaseDomainForCampaign.mockRejectedValueOnce(
      new ConflictException('Domain voteforjane.run is no longer available'),
    )

    const campaign = {
      ...createMockCampaign({ details: { electionDate: '2026-11-03' } }),
      user: createMockUser({ firstName: 'Jane', lastName: 'Doe' }),
    }

    await expect(
      controller.purchaseDomain(campaign, { domain: 'voteforjane.run' }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('handler is registered for POST /purchase with @UseCampaign() including user, @HttpCode(202), and @McpTool description', () => {
    const reflector = new Reflector()

    const path = Reflect.getMetadata('path', controller.purchaseDomain)
    const method = Reflect.getMetadata('method', controller.purchaseDomain)
    expect(path).toBe('purchase')
    expect(method).toBe(RequestMethod.POST)

    const statusCode = Reflect.getMetadata(
      '__httpCode__',
      controller.purchaseDomain,
    )
    expect(statusCode).toBe(HttpStatus.ACCEPTED)

    const useCampaignMeta = reflector.get(
      REQUIRE_CAMPAIGN_META_KEY,
      controller.purchaseDomain,
    )
    expect(useCampaignMeta).toBeDefined()
    expect(useCampaignMeta.include).toEqual({ user: true })

    const mcpMeta = reflector.get(MCP_TOOL_KEY, controller.purchaseDomain)
    expect(mcpMeta).toBeDefined()
    expect(mcpMeta.description).toMatch(/Reserve a specific available domain/)
  })
})

describe('DomainsController.purchaseDomain MCP discoverability', () => {
  const buildModule = (): ModuleMetadata => ({
    imports: [DiscoveryModule],
    controllers: [DomainsController],
    providers: [
      McpServerService,
      { provide: DomainsService, useValue: {} },
      { provide: WebsitesService, useValue: {} },
      {
        provide: HttpAdapterHost,
        useValue: {
          httpAdapter: {
            getInstance: () => ({
              inject: async () => ({
                statusCode: 200,
                body: '{}',
                headers: {},
              }),
            }),
          },
        },
      },
      { provide: PinoLogger, useValue: createMockLogger() },
    ],
  })

  it('appears in gatherTools() output with name POST_domains_purchase, full input/output schemas, and accurate description', async () => {
    const moduleRef = await Test.createTestingModule(buildModule())
      .overrideGuard(UseCampaignGuard)
      .useValue({ canActivate: () => true })
      .compile()
    await moduleRef.init()

    const tools = moduleRef.get(McpServerService).getTools()
    const purchase = tools.find((t) => t.toolName === 'POST_domains_purchase')

    expect(purchase).toBeDefined()
    expect(purchase!.description).toMatch(/Reserve a specific available domain/)
    expect(purchase!.description).toMatch(
      /poll GET \/v1\/websites\/domains\/status/,
    )
    expect(purchase!.outputSchema).toBe(PurchaseDomainResponseSchema)
    expect(purchase!.inputDeclarations.body.declared).toBe(true)
    expect(purchase!.inputDeclarations.body.schema).toBe(
      PurchaseDomainBodySchema.schema,
    )
    expect(purchase!.inputDeclarations.query.declared).toBe(false)
    expect(purchase!.inputDeclarations.params.declared).toBe(false)
  })
})
