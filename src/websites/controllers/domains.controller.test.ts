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
  SubmitRegistrantVerificationBodySchema,
  SubmitRegistrantVerificationResponseSchema,
} from '../schemas/SubmitRegistrantVerification.schema'
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
          status: DomainStatus.submitted,
          price: 8,
        },
        alreadyExisted: false,
        message: 'Domain registration submitted',
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
      maxPrice: 50,
    })

    expect(mockDomains.purchaseDomainForCampaign).toHaveBeenCalledWith(
      campaign,
      'voteforjane.run',
      50,
    )
    expect(result).toEqual({
      domain: {
        id: 99,
        name: 'voteforjane.run',
        status: DomainStatus.submitted,
        price: 8,
      },
      alreadyExisted: false,
      message: 'Domain registration submitted',
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
      controller.purchaseDomain(campaign, {
        domain: 'voteforjane.run',
        maxPrice: 50,
      }),
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
    expect(mcpMeta.description).toMatch(/Purchase a specific available domain/)
  })

  it('PurchaseDomainBodySchema enforces server-side maxPrice ceiling', () => {
    const validResult = PurchaseDomainBodySchema.schema.safeParse({
      domain: 'voteforjane.run',
      maxPrice: 50,
    })
    expect(validResult.success).toBe(true)

    const overCeilingResult = PurchaseDomainBodySchema.schema.safeParse({
      domain: 'voteforjane.run',
      maxPrice: 200,
    })
    expect(overCeilingResult.success).toBe(false)
  })
})

describe('DomainsController.submitRegistrantVerification', () => {
  let controller: DomainsController
  let mockDomains: {
    submitRegistrantVerificationForCampaign: ReturnType<typeof vi.fn>
  }

  const verifiedAt = new Date('2026-05-13T00:00:00.000Z')

  beforeEach(async () => {
    mockDomains = {
      submitRegistrantVerificationForCampaign: vi.fn().mockResolvedValue({
        domain: 'voteforjane.run',
        alreadyVerified: true,
        registrantVerifiedAt: verifiedAt,
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

  it('delegates to submitRegistrantVerificationForCampaign and propagates alreadyVerified', async () => {
    const campaign = createMockCampaign({ id: 7 })

    const result = await controller.submitRegistrantVerification(campaign, {
      domain: 'voteforjane.run',
      verificationUrl: 'https://vercel.com/verify?token=abc',
    })

    expect(
      mockDomains.submitRegistrantVerificationForCampaign,
    ).toHaveBeenCalledWith(
      7,
      'voteforjane.run',
      'https://vercel.com/verify?token=abc',
    )
    expect(result).toEqual({
      domain: 'voteforjane.run',
      alreadyVerified: true,
      registrantVerifiedAt: verifiedAt,
    })
  })

  it('handler is registered for POST /registrant-verification with @UseCampaign(), @HttpCode(200), and @McpTool description', () => {
    const reflector = new Reflector()

    const path = Reflect.getMetadata(
      'path',
      controller.submitRegistrantVerification,
    )
    const method = Reflect.getMetadata(
      'method',
      controller.submitRegistrantVerification,
    )
    expect(path).toBe('registrant-verification')
    expect(method).toBe(RequestMethod.POST)

    const statusCode = Reflect.getMetadata(
      '__httpCode__',
      controller.submitRegistrantVerification,
    )
    expect(statusCode).toBe(HttpStatus.OK)

    const useCampaignMeta = reflector.get(
      REQUIRE_CAMPAIGN_META_KEY,
      controller.submitRegistrantVerification,
    )
    expect(useCampaignMeta).toBeDefined()

    const mcpMeta = reflector.get(
      MCP_TOOL_KEY,
      controller.submitRegistrantVerification,
    )
    expect(mcpMeta).toBeDefined()
    expect(mcpMeta.description).toMatch(/vercel\.com/)
    expect(mcpMeta.description).toMatch(/4xx/)
  })

  it('SubmitRegistrantVerificationBodySchema requires a valid URL and FQDN', () => {
    expect(
      SubmitRegistrantVerificationBodySchema.schema.safeParse({
        domain: 'voteforjane.run',
        verificationUrl: 'https://vercel.com/verify?token=abc',
      }).success,
    ).toBe(true)

    expect(
      SubmitRegistrantVerificationBodySchema.schema.safeParse({
        domain: 'voteforjane.run',
        verificationUrl: 'not-a-url',
      }).success,
    ).toBe(false)
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
    expect(purchase!.description).toMatch(
      /Purchase a specific available domain/,
    )
    expect(purchase!.description).toMatch(/Poll GET \/v1\/domains\/status/)
    expect(purchase!.outputSchema).toBe(PurchaseDomainResponseSchema)
    expect(purchase!.inputDeclarations.body.declared).toBe(true)
    expect(purchase!.inputDeclarations.body.schema).toBe(
      PurchaseDomainBodySchema.schema,
    )
    expect(purchase!.inputDeclarations.query.declared).toBe(false)
    expect(purchase!.inputDeclarations.params.declared).toBe(false)
  })

  it('exposes POST_domains_registrant_verification with full input/output schemas', async () => {
    const moduleRef = await Test.createTestingModule(buildModule())
      .overrideGuard(UseCampaignGuard)
      .useValue({ canActivate: () => true })
      .compile()
    await moduleRef.init()

    const tools = moduleRef.get(McpServerService).getTools()
    const verify = tools.find(
      (t) => t.toolName === 'POST_domains_registrant_verification',
    )

    expect(verify).toBeDefined()
    expect(verify!.outputSchema).toBe(
      SubmitRegistrantVerificationResponseSchema,
    )
    expect(verify!.inputDeclarations.body.declared).toBe(true)
    expect(verify!.inputDeclarations.body.schema).toBe(
      SubmitRegistrantVerificationBodySchema.schema,
    )
  })
})
