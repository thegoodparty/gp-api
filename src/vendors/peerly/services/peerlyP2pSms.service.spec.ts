import { PublicOwner, PublicOwnerTypeEnum } from '@hubspot/api-client/lib/codegen/crm/owners'
import { HttpService } from '@nestjs/axios'
import { BadGatewayException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { of, throwError } from 'rxjs'
import { CrmCampaignsService } from '../../../campaigns/services/crmCampaigns.service'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { PeerlyP2pSmsService } from './peerlyP2pSms.service'

// Helper to create mock Axios config
const createMockAxiosConfig = (): InternalAxiosRequestConfig => ({
  headers: {} as InternalAxiosRequestConfig['headers'],
  url: '',
  method: 'get',
})

// Helper to create mock PublicOwner
const createMockOwner = (overrides: Partial<PublicOwner> = {}): PublicOwner => ({
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
  let peerlyAuth: jest.Mocked<PeerlyAuthenticationService>
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
    peerlyAuth = module.get(PeerlyAuthenticationService) as jest.Mocked<PeerlyAuthenticationService>
    crmCampaigns = module.get(CrmCampaignsService) as jest.Mocked<CrmCampaignsService>
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('listAgents', () => {
    it('should return array of agents from Peerly API', async () => {
      const mockResponse: AxiosResponse = {
        data: mockAgents,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: createMockAxiosConfig(),
      }

      httpService.get.mockReturnValue(of(mockResponse))

      const result = await service.listAgents()

      expect(result).toEqual(mockAgents)
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/1to1/agents'),
        expect.any(Object),
      )
    })

    it('should return empty array when no agents exist', async () => {
      const mockResponse: AxiosResponse = {
        data: [],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: createMockAxiosConfig(),
      }

      httpService.get.mockReturnValue(of(mockResponse))

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
      const mockResponse: AxiosResponse = {
        data: mockAgents,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: createMockAxiosConfig(),
      }
      httpService.get.mockReturnValue(of(mockResponse))
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

      const mockResponse: AxiosResponse = {
        data: agentsWithoutEmail,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: createMockAxiosConfig(),
      }
      httpService.get.mockReturnValue(of(mockResponse))

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

      const mockResponse: AxiosResponse = {
        data: duplicateAgents,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: createMockAxiosConfig(),
      }
      httpService.get.mockReturnValue(of(mockResponse))

      const result = await service.getAgentIdByEmail('duplicate@goodparty.org')

      expect(result).toBe('agent-first@11537225')
    })

    it('should throw when listAgents fails', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('API error')),
      )

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

    const mockJobResponse: AxiosResponse = {
      data: {
        id: 'job-123',
        name: 'Test Job',
        status: 'active',
        templates: [],
        agents: [],
      },
      status: 201,
      statusText: 'Created',
      headers: {},
      config: createMockAxiosConfig(),
    }

    beforeEach(() => {
      const mockAgentsResponse: AxiosResponse = {
        data: mockAgents,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: createMockAxiosConfig(),
      }
      httpService.get.mockReturnValue(of(mockAgentsResponse))
      httpService.post.mockReturnValue(of(mockJobResponse))
    })

    it('should include agent_ids when PA is found in Peerly', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: 'john@goodparty.org',
          firstName: 'John',
          lastName: 'Doe',
        }),
      )

      await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(crmCampaigns.getCrmCompanyOwner).toHaveBeenCalledWith('crm-123')
      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          agent_ids: ['agent-123@11537225'],
        }),
        expect.any(Object),
      )
    })

    it('should NOT include agent_ids when no crmCompanyId provided', async () => {
      await service.createJob({
        ...baseJobParams,
        crmCompanyId: '',
      })

      expect(crmCampaigns.getCrmCompanyOwner).not.toHaveBeenCalled()
      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          agent_ids: expect.anything(),
        }),
        expect.any(Object),
      )
    })

    it('should NOT include agent_ids when PA has no email', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: null as unknown as string,
          firstName: 'John',
          lastName: 'Doe',
        }),
      )

      await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          agent_ids: expect.anything(),
        }),
        expect.any(Object),
      )
    })

    it('should NOT include agent_ids when PA email is empty string', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: '',
          firstName: 'John',
          lastName: 'Doe',
        }),
      )

      await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          agent_ids: expect.anything(),
        }),
        expect.any(Object),
      )
    })

    it('should NOT include agent_ids when PA not found in Peerly', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: 'notinpeerly@goodparty.org',
          firstName: 'Unknown',
          lastName: 'User',
        }),
      )

      await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          agent_ids: expect.anything(),
        }),
        expect.any(Object),
      )
    })

    it('should NOT include agent_ids when PA agent is inactive', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: 'inactive@goodparty.org',
          firstName: 'Inactive',
          lastName: 'User',
        }),
      )

      await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          agent_ids: expect.anything(),
        }),
        expect.any(Object),
      )
    })

    it('should handle getCrmCompanyOwner returning undefined', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(undefined)

      await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          agent_ids: expect.anything(),
        }),
        expect.any(Object),
      )
    })

    it('should handle getCrmCompanyOwner throwing error gracefully', async () => {
      crmCampaigns.getCrmCompanyOwner.mockRejectedValue(
        new Error('HubSpot API error'),
      )

      await expect(
        service.createJob({
          ...baseJobParams,
          crmCompanyId: 'crm-123',
        }),
      ).rejects.toThrow()
    })

    it('should correctly format agent_ids as array with single agent', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: 'jane@goodparty.org',
          firstName: 'Jane',
          lastName: 'Doe',
        }),
      )

      await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          agent_ids: expect.arrayContaining(['agent-456@11537225']),
        }),
        expect.any(Object),
      )

      const callArgs = httpService.post.mock.calls[0]
      const body = callArgs[1] as Record<string, unknown>
      expect(Array.isArray(body.agent_ids)).toBe(true)
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

      await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          agent_ids: ['agent-123@11537225'],
        }),
        expect.any(Object),
      )
    })

    it('should include other required fields in job creation', async () => {
      crmCampaigns.getCrmCompanyOwner.mockResolvedValue(
        createMockOwner({
          email: 'john@goodparty.org',
          firstName: 'John',
          lastName: 'Doe',
        }),
      )

      await service.createJob({
        ...baseJobParams,
        crmCompanyId: 'crm-123',
      })

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          account_id: expect.any(String),
          name: 'Test Job',
          templates: expect.any(Array),
          did_state: 'NY',
          can_use_mms: false,
          schedule_id: expect.any(Number),
          identity_id: 'identity-123',
          agent_ids: expect.any(Array),
        }),
        expect.any(Object),
      )
    })
  })
})
