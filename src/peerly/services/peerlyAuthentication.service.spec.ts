import { Test, TestingModule } from '@nestjs/testing'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { HttpService } from '@nestjs/axios'
import { JwtService } from '@nestjs/jwt'
import { lastValueFrom } from 'rxjs'

jest.mock('../config/peerlyBaseConfig', () => ({
  PeerlyBaseConfig: class {
    baseUrl = 'http://peerly'
    email = 'email-md5'
    password = 'pass-md5'
    accountNumber = '123'
    httpTimeoutMs = 1000
  },
}))

jest.mock('rxjs', () => ({
  ...jest.requireActual('rxjs'),
  lastValueFrom: jest.fn(),
}))

describe('PeerlyAuthenticationService', () => {
  let service: PeerlyAuthenticationService
  let jwt: JwtService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeerlyAuthenticationService,
        { provide: HttpService, useValue: { post: jest.fn() } },
        {
          provide: JwtService,
          useValue: { decode: jest.fn() },
        },
      ],
    }).compile()

    service = module.get<PeerlyAuthenticationService>(
      PeerlyAuthenticationService,
    )
    jwt = module.get<JwtService>(JwtService)
  })

  it('renews token and returns authorization header', async () => {
    ;(lastValueFrom as unknown as jest.Mock).mockResolvedValueOnce({
      data: { token: 'jwt-token' },
    })
    ;(jwt.decode as jest.Mock).mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 })

    const header = await service.getAuthorizationHeader()
    expect(header).toEqual({ Authorization: 'Jwt jwt-token' })
  })

  it('throws when token renewal returns token without exp', async () => {
    ;(lastValueFrom as unknown as jest.Mock).mockResolvedValueOnce({
      data: { token: 'jwt-token' },
    })
    ;(jwt.decode as jest.Mock).mockReturnValue(null)

    await expect(service.getToken()).rejects.toThrow('Peerly token renewal failed')
  })
})


