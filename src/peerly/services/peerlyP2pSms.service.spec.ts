import { Test, TestingModule } from '@nestjs/testing'
import { PeerlyP2pSmsService } from './peerlyP2pSms.service'
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

describe('PeerlyP2pSmsService', () => {
  let service: PeerlyP2pSmsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeerlyP2pSmsService,
        { provide: HttpService, useValue: { post: jest.fn() } },
        {
          provide: PeerlyAuthenticationService,
          useValue: {
            getAuthorizationHeader: jest
              .fn()
              .mockResolvedValue({ Authorization: 'Jwt token' }),
          },
        },
      ],
    }).compile()

    service = module.get(PeerlyP2pSmsService)
  })

  it('createJob returns jobId from body', async () => {
    ;(lastValueFrom as unknown as jest.Mock).mockResolvedValueOnce({
      data: {
        id: 'job-1',
        name: 'n',
        status: 'OK',
        templates: [{ text: 'x', title: 't' }],
      },
      headers: {},
    })
    const jobId = await service.createJob({
      name: 'n',
      templates: [{ title: 't', text: 'x' }],
      didState: 'NY',
    })
    expect(jobId).toBe('job-1')
  })

  it('createJob falls back to Location header when id missing', async () => {
    ;(lastValueFrom as unknown as jest.Mock).mockResolvedValueOnce({
      data: { name: 'n', status: 'OK', templates: [{ text: 'x', title: 't' }] },
      headers: { location: '/api/1to1/jobs/job-2' },
    })
    const jobId = await service.createJob({
      name: 'n',
      templates: [{ title: 't', text: 'x' }],
      didState: 'NY',
    })
    expect(jobId).toBe('job-2')
  })
})
