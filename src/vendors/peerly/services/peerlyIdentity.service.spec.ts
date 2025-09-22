// Mock environment variables before any imports
process.env.PEERLY_API_BASE_URL = 'https://test-api.peerly.com'
process.env.PEERLY_MD5_EMAIL = 'test@example.com'
process.env.PEERLY_MD5_PASSWORD = 'test-password'
process.env.PEERLY_ACCOUNT_NUMBER = '12345'
process.env.PEERLY_SCHEDULE_ID = '67890'

import { Test, TestingModule } from '@nestjs/testing'
import { HttpService } from '@nestjs/axios'
import { of } from 'rxjs'
import { AxiosResponse } from 'axios'
import { PeerlyIdentityService } from './peerlyIdentity.service'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { GooglePlacesService } from '../../google/services/google-places.service'
import { User, TcrCompliance } from '@prisma/client'
import { getUserFullName } from '../../../users/util/users.util'
import { Approve10DLCBrandResponse } from '../peerly.types'
import { PEERLY_ENTITY_TYPE, PEERLY_USECASE } from './peerly.const'

describe('PeerlyIdentityService', () => {
  let service: PeerlyIdentityService
  let httpService: HttpService

  const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
  } as User

  const mockTcrCompliance: TcrCompliance = {
    id: 'test-compliance-id',
    committeeName: 'Test Committee',
    peerlyIdentityId: 'test-identity-id',
  } as TcrCompliance

  const mockApproveResponse: AxiosResponse<Approve10DLCBrandResponse> = {
    data: {
      campaign_verify_token: 'test-token',
      status: 'approved',
      street: '123 Main St',
      usecases: ['political'],
      phone: '+1234567890',
      legal_entity_type: 'LLC',
      account_id: 'test-account-id',
      companyName: 'Test Committee',
      country: 'US',
      postalCode: '12345',
      entityType: 'LLC',
      base_account_id: 'test-base-account-id',
      email: 'test@example.com',
      state: 'CA',
      vertical: 'political',
      is_political: true,
      website: 'https://test.com',
      ein: '123456789',
      sample1: 'Sample message 1',
      displayName: 'Test Committee',
      entity_type: 'LLC',
      city: 'Test City',
      usecase: 'political',
      sample2: 'Sample message 2',
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any,
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeerlyIdentityService,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
          },
        },
        {
          provide: PeerlyAuthenticationService,
          useValue: {
            getAccessToken: jest.fn().mockResolvedValue('mock-token'),
          },
        },
        {
          provide: GooglePlacesService,
          useValue: {
            getAddressByPlaceId: jest.fn(),
          },
        },
      ],
    }).compile()

    service = module.get<PeerlyIdentityService>(PeerlyIdentityService)
    httpService = module.get<HttpService>(HttpService)
  })

  describe('approve10DLCBrand', () => {
    it('should successfully approve 10DLC brand with correct parameters', async () => {
      // Arrange
      const campaignVerifyToken = 'test-verify-token'
      const expectedUrl = `${service['baseUrl']}/v2/tdlc/${mockTcrCompliance.peerlyIdentityId}/approve`
      
      const expectedPayload = {
        campaign_verify_token: campaignVerifyToken,
        entity_type: PEERLY_ENTITY_TYPE,
        usecase: PEERLY_USECASE,
        sample1: `Hello {first_name}, this is ${getUserFullName(mockUser)}, a volunteer from ${mockTcrCompliance.committeeName}. We need your support in the upcoming election. Every vote will count, please reply and let me know if you will need any help. Reply STOP to opt-out`,
        sample2: `Hello {first_name}, this is ${getUserFullName(mockUser)}, a volunteer from ${mockTcrCompliance.committeeName}. We're looking for volunteers for some canvassing this coming weekend and I was wondering if you may be interested?. Reply STOP to opt-out`,
      }

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockApproveResponse))
      jest.spyOn(service as any, 'getBaseHttpHeaders').mockResolvedValue({
        Authorization: 'Bearer mock-token',
        'Content-Type': 'application/json',
      })

      // Act
      const result = await service.approve10DLCBrand(
        mockUser,
        mockTcrCompliance,
        campaignVerifyToken,
      )

      // Assert
      expect(httpService.post).toHaveBeenCalledWith(
        expectedUrl,
        expectedPayload,
        {
          Authorization: 'Bearer mock-token',
          'Content-Type': 'application/json',
        },
      )
      expect(result).toEqual({
        status: 'approved',
        street: '123 Main St',
        usecases: ['political'],
        phone: '+1234567890',
        legal_entity_type: 'LLC',
        account_id: 'test-account-id',
        companyName: 'Test Committee',
        country: 'US',
        postalCode: '12345',
        entityType: 'LLC',
        base_account_id: 'test-base-account-id',
        email: 'test@example.com',
        state: 'CA',
        vertical: 'political',
        is_political: true,
        website: 'https://test.com',
        ein: '123456789',
        sample1: 'Sample message 1',
        displayName: 'Test Committee',
        entity_type: 'LLC',
        city: 'Test City',
        usecase: 'political',
        sample2: 'Sample message 2',
      })
    })
  })
})
