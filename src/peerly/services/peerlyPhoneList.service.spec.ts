import { Test, TestingModule } from '@nestjs/testing'
import { PeerlyPhoneListService } from './peerlyPhoneList.service'
import { HttpService } from '@nestjs/axios'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { lastValueFrom } from 'rxjs'
import { Readable } from 'stream'

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

describe('PeerlyPhoneListService', () => {
  let service: PeerlyPhoneListService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeerlyPhoneListService,
        { provide: HttpService, useValue: { post: jest.fn(), get: jest.fn() } },
        {
          provide: PeerlyAuthenticationService,
          useValue: { getAuthorizationHeader: jest.fn().mockResolvedValue({ Authorization: 'Jwt token' }) },
        },
      ],
    }).compile()

    service = module.get(PeerlyPhoneListService)
  })

  it('uploadPhoneListToken returns token', async () => {
    ;(lastValueFrom as unknown as jest.Mock).mockResolvedValueOnce({
      data: { Data: { token: 'tok1' } },
    })
    const token = await service.uploadPhoneListToken({
      listName: 'list',
      csvStream: Readable.from(['csv']),
    })
    expect(token).toBe('tok1')
  })

  it('uploadPhoneList calls status and returns response', async () => {
    ;(lastValueFrom as unknown as jest.Mock)
      .mockResolvedValueOnce({ data: { Data: { token: 'tok2' } } })
      .mockResolvedValueOnce({ data: { Data: { list_status: 'OK' } } })
    const res = await service.uploadPhoneList({
      listName: 'list',
      csvStream: Readable.from(['csv']),
    })
    expect(res).toEqual({ Data: { list_status: 'OK' } })
  })
})


