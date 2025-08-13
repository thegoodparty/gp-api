import { Test, TestingModule } from '@nestjs/testing'
import { PeerlyIdentityService } from './peerlyIdentity.service'
import { HttpService } from '@nestjs/axios'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { lastValueFrom } from 'rxjs'

jest.mock('../config/peerlyBaseConfig', () => ({
  PeerlyBaseConfig: class {
    baseUrl = 'http://peerly'
    accountNumber = '123'
    httpTimeoutMs = 1000
  },
}))

jest.mock('rxjs', () => ({
  ...jest.requireActual('rxjs'),
  lastValueFrom: jest.fn(),
}))

describe('PeerlyIdentityService', () => {
  let service: PeerlyIdentityService
  let auth: PeerlyAuthenticationService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeerlyIdentityService,
        { provide: HttpService, useValue: { post: jest.fn() } },
        {
          provide: PeerlyAuthenticationService,
          useValue: { getAuthorizationHeader: jest.fn().mockResolvedValue({ Authorization: 'Jwt token' }) },
        },
      ],
    }).compile()

    service = module.get(PeerlyIdentityService)
    auth = module.get(PeerlyAuthenticationService)
  })

  it('createIdentity returns identity from response', async () => {
    ;(lastValueFrom as unknown as jest.Mock).mockResolvedValueOnce({
      data: { Data: { id: 'ident-1' } },
    })
    const id = await service.createIdentity('My Org')
    expect(id).toEqual({ id: 'ident-1' })
    expect(auth.getAuthorizationHeader).toHaveBeenCalled()
  })

  it('submitIdentityProfile returns link', async () => {
    ;(lastValueFrom as unknown as jest.Mock).mockResolvedValueOnce({
      data: { link: 'https://peerly/link' },
    })
    const link = await service.submitIdentityProfile('ident-1')
    expect(link).toBe('https://peerly/link')
  })
})


