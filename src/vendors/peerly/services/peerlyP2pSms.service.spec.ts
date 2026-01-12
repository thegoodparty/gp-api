import {
  PublicOwner,
  PublicOwnerTypeEnum,
} from '@hubspot/api-client/lib/codegen/crm/owners'
import { HttpService } from '@nestjs/axios'
import { BadGatewayException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { AxiosResponse } from 'axios'
import { of, throwError } from 'rxjs'
import { CrmCampaignsService } from '../../../campaigns/services/crmCampaigns.service'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { PeerlyP2pSmsService } from './peerlyP2pSms.service'

// Helper to create mock PublicOwner
const createMockOwner = (
  overrides: Partial<PublicOwner> = {},
): PublicOwner => ({
  createdAt: new Date(),
  archived: false,
  id: 'owner-123',
  type: PublicOwnerTypeEnum.Person,
  updatedAt: new Date(),
  email: '',
  firstName: '',
  lastName: '',
  userId: 123,
  teams: [],
  ...overrides,
})

describe('PeerlyP2pSmsService - Agent Assignment', () => {
  let service: PeerlyP2pSmsService
  let httpService: jest.Mocked<HttpService>
  let _peerlyAuth: jest.Mocked<PeerlyAuthenticationService>
  let crmCampaigns: jest.Mocked<CrmCampaignsService>

  const mockAgents = [
    {
      id: 'agent-123@11537225',
      display_email: 'john@goodparty.org',
      status: 'active',
    },
    {
      id: 'agent-456@11537225',
      display_email: 'jane@goodparty.org',
      status: 'active',
    },
    {
      id: 'agent-789@11537225',
      display_email: 'inactive@goodparty.org',
      status: 'inactive',
    },
  ]

  beforeEach(async () => {
    const mockHttpService = {
      get: jest.fn(),
      post: jest.fn(),
    }

    const mockPeerlyAuth = {
      getAuthorizationHeader: jest.fn().mockResolvedValue({
        Authorization: 'JWT mock-token',
      }),
      getAuthenticatedUser: jest.fn(),
    }

    const mockCrmCampaigns = {
      getCrmCompanyOwner: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeerlyP2pSmsService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: PeerlyAuthenticationService,
          useValue: mockPeerlyAuth,
        },
        {
          provide: CrmCampaignsService,
          useValue: mockCrmCampaigns,
        },
      ],
    }).compile()

    service = module.get<PeerlyP2pSmsService>(PeerlyP2pSmsService)
    httpService = module.get(HttpService) as jest.Mocked<HttpService>
    _peerlyAuth = module.get(
      PeerlyAuthenticationService,
    ) as jest.Mocked<PeerlyAuthenticationService>
    crmCampaigns = module.get(
      CrmCampaignsService,
    ) as jest.Mocked<CrmCampaignsService>
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('listAgents', () => {
    it('should return array of agents from Peerly API', async () => {
      httpService.get.mockReturnValue(of({ data: mockAgents } as AxiosResponse))

      const result = await service.listAgents()

      expect(result).toEqual(mockAgents)
      expect(httpService.get).toHaveBeenCalledTimes(1)
    })

    it('should return empty array when no agents exist', async () => {
      httpService.get.mockReturnValue(of({ data: [] } as AxiosResponse))

      const result = await service.listAgents()

      expect(result).toEqual([])
    })

    it('should throw BadGatewayException when API fails', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      )

      await expect(service.listAgents()).rejects.toThrow(BadGatewayException)
    })
  })

  describe('getAgentIdByEmail', () => {
    beforeEach(() => {
      httpService.get.mockReturnValue(of({ data: mockAgents } as AxiosResponse))
    })

    it('should return agent ID when email matches active agent', async () => {
      const result = await service.getAgentIdByEmail('john@goodparty.org')

      expect(result).toBe('agent-123@11537225')
    })

    it('should return null when email does not match any agent', async () => {
      const result = await service.getAgentIdByEmail('notfound@goodparty.org')

      expect(result).toBeNull()
    })

    it('should be case-insensitive when matching emails', async () => {
      const result = await service.getAgentIdByEmail('JOHN@GOODPARTY.ORG')

      expect(result).toBe('agent-123@11537225')
    })

    it('should return null for inactive agents', async () => {
      const result = await service.getAgentIdByEmail('inactive@goodparty.org')

      expect(result).toBeNull()
    })

    it('should return null when agent has no display_email', async () => {
      const agentsWithoutEmail = [
        {
          id: 'agent-no-email@11537225',
          display_email: undefined,
          status: 'active',
        },
      ]

      httpService.get.mockReturnValue(
        of({ data: agentsWithoutEmail } as AxiosResponse),
      )

      const result = await service.getAgentIdByEmail('test@example.com')

      expect(result).toBeNull()
    })

    it('should return null for empty string email', async () => {
      const result = await service.getAgentIdByEmail('')

      expect(result).toBeNull()
      expect(httpService.get).not.toHaveBeenCalled()
    })

    it('should return null for whitespace-only email', async () => {
      const result = await service.getAgentIdByEmail('   ')

      expect(result).toBeNull()
      expect(httpService.get).not.toHaveBeenCalled()
    })

    it('should return first match if multiple agents have same email', async () => {
      const duplicateAgents = [
        {
          id: 'agent-first@11537225',
          display_email: 'duplicate@goodparty.org',
          status: 'active',
        },
        {
          id: 'agent-second@11537225',
          display_email: 'duplicate@goodparty.org',
          status: 'active',
        },
      ]

      httpService.get.mockReturnValue(
        of({ data: duplicateAgents } as AxiosResponse),
      )

      const result = await service.getAgentIdByEmail('duplicate@goodparty.org')

      expect(result).toBe('agent-first@11537225')
    })

    it('should throw when listAgents fails', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('API error')))

      await expect(
        service.getAgentIdByEmail('john@goodparty.org'),
      ).rejects.toThrow(BadGatewayException)
    })
  })

  describe('createJob - Agent Assignment Logic', () => {
    const baseJobParams = {
      name: 'Test Job',
      templates: [
        {
          is_default: true,
          title: 'Test Template',
          text: 'Hello {first_name}',
        },
      ],
      didState: 'NY',
      identityId: 'identity-123',
    }

    beforeEach(() => {
      httpService.get.mockReturnValue(of({ data: mockAgents } as AxiosResponse))
      httpService.post.mockReturnValue(
        of({
          data: {
            id: 'job-123',
            name: 'Test Job',
            status: 'active',
            templates: [],
            agents: [],
          },
        } as AxiosResponse),
      )
    })

    it('should include agent_ids when PA is found in Peerly', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: 'john@goodparty.org',
          firstName: 'John',
          lastName: 'Doe',
        }),
      )

      const jobId = await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(jobId).toBe('job-123')
      expect(crmCampaigns.getCrmCompanyOwner).toHaveBeenCalledWith('crm-123')

      const callArgs = httpService.post.mock.calls[0]
      const body = callArgs[1] as Record<string, unknown>

      expect(body.agent_ids).toEqual(['agent-123@11537225'])
      expect(body.name).toBe(baseJobParams.name)
      expect(body.did_state).toBe(baseJobParams.didState)
    })

    it('should NOT include agent_ids when no crmCompanyId provided', async () => {
      const jobId = await service.createJob({
        ...baseJobParams,
        crmCompanyId: '',
      })

      expect(jobId).toBe('job-123')
      expect(crmCampaigns.getCrmCompanyOwner).not.toHaveBeenCalled()

      const callArgs = httpService.post.mock.calls[0]
      const body = callArgs[1] as Record<string, unknown>

      expect(body).not.toHaveProperty('agent_ids')
      expect(body.name).toBe(baseJobParams.name)
      expect(body.did_state).toBe(baseJobParams.didState)
      expect(body.templates).toEqual(baseJobParams.templates)
    })

    it('should NOT include agent_ids when PA has no email', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: null as unknown as string,
          firstName: 'John',
          lastName: 'Doe',
        }),
      )

      const jobId = await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(jobId).toBe('job-123')

      const callArgs = httpService.post.mock.calls[0]
      const body = callArgs[1] as Record<string, unknown>

      expect(body).not.toHaveProperty('agent_ids')
      expect(body.name).toBe(baseJobParams.name)
    })

    it('should NOT include agent_ids when PA email is empty string', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: '',
          firstName: 'John',
          lastName: 'Doe',
        }),
      )

      const jobId = await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(jobId).toBe('job-123')

      const callArgs = httpService.post.mock.calls[0]
      const body = callArgs[1] as Record<string, unknown>

      expect(body).not.toHaveProperty('agent_ids')
      expect(body.name).toBe(baseJobParams.name)
    })

    it('should NOT include agent_ids when PA not found in Peerly', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: 'notinpeerly@goodparty.org',
          firstName: 'Unknown',
          lastName: 'User',
        }),
      )

      const jobId = await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(jobId).toBe('job-123')

      const callArgs = httpService.post.mock.calls[0]
      const body = callArgs[1] as Record<string, unknown>

      expect(body).not.toHaveProperty('agent_ids')
      expect(body.name).toBe(baseJobParams.name)
    })

    it('should NOT include agent_ids when PA agent is inactive', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: 'inactive@goodparty.org',
          firstName: 'Inactive',
          lastName: 'User',
        }),
      )

      const jobId = await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(jobId).toBe('job-123')

      const callArgs = httpService.post.mock.calls[0]
      const body = callArgs[1] as Record<string, unknown>

      expect(body).not.toHaveProperty('agent_ids')
      expect(body.name).toBe(baseJobParams.name)
    })

    it('should handle getCrmCompanyOwner returning undefined', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(undefined)

      const jobId = await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(jobId).toBe('job-123')

      const callArgs = httpService.post.mock.calls[0]
      const body = callArgs[1] as Record<string, unknown>

      expect(body).not.toHaveProperty('agent_ids')
      expect(body.name).toBe(baseJobParams.name)
    })

    it('should handle getCrmCompanyOwner throwing error gracefully', async () => {
      crmCampaigns.getCrmCompanyOwner.mockRejectedValue(
        new Error('HubSpot API error'),
      )

      // Should succeed and create job without agent assignment
      const jobId = await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(jobId).toBe('job-123')

      // Verify job was created without agent_ids (business logic)
      const callArgs = httpService.post.mock.calls[0]
      const body = callArgs[1] as Record<string, unknown>

      expect(body).not.toHaveProperty('agent_ids')
      expect(body.name).toBe(baseJobParams.name)
      expect(body.did_state).toBe(baseJobParams.didState)
    })

    it('should correctly format agent_ids as array with single agent', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: 'jane@goodparty.org',
          firstName: 'Jane',
          lastName: 'Doe',
        }),
      )

      const jobId = await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(jobId).toBe('job-123')

      const callArgs = httpService.post.mock.calls[0]
      const body = callArgs[1] as Record<string, unknown>

      expect(Array.isArray(body.agent_ids)).toBe(true)
      expect(body.agent_ids).toEqual(['agent-456@11537225'])
      expect(body.agent_ids).toHaveLength(1)
    })

    it('should match email case-insensitively for agent lookup', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: 'JOHN@GOODPARTY.ORG',
          firstName: 'John',
          lastName: 'Doe',
        }),
      )

      const jobId = await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(jobId).toBe('job-123')

      const callArgs = httpService.post.mock.calls[0]
      const body = callArgs[1] as Record<string, unknown>

      expect(body.agent_ids).toEqual(['agent-123@11537225'])
    })

    it('should include other required fields in job creation', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: 'john@goodparty.org',
          firstName: 'John',
          lastName: 'Doe',
        }),
      )

      const jobId = await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(jobId).toBe('job-123')

      const callArgs = httpService.post.mock.calls[0]
      const body = callArgs[1] as Record<string, unknown>

      // Business logic: verify correct data passed
      expect(body.name).toBe('Test Job')
      expect(body.templates).toEqual(baseJobParams.templates)
      expect(body.did_state).toBe('NY')
      expect(body.can_use_mms).toBe(false)
      expect(body.identity_id).toBe('identity-123')
      expect(body.agent_ids).toEqual(['agent-123@11537225'])
    })
  })
})
