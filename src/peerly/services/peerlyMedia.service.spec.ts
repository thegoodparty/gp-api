import { Test, TestingModule } from '@nestjs/testing'
import { PeerlyMediaService } from './peerlyMedia.service'
import { HttpService } from '@nestjs/axios'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { Readable } from 'stream'
import { lastValueFrom } from 'rxjs'
import { MimeTypes } from 'http-constants-ts'

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

describe('PeerlyMediaService', () => {
  let service: PeerlyMediaService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeerlyMediaService,
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

    service = module.get(PeerlyMediaService)
  })

  it('rejects invalid mime type', async () => {
    const stream = Readable.from(['data'])
    await expect(
      service.createMedia({
        identityId: 'id1',
        fileStream: stream,
        fileName: 'a.txt',
        mimeType: 'text/plain',
      }),
    ).rejects.toThrow('Invalid media type')
  })

  it('returns media_id on success', async () => {
    const stream = Readable.from(['data'])
    ;(lastValueFrom as unknown as jest.Mock).mockResolvedValueOnce({
      data: { media_id: 'm-1', status: 'OK' },
    })
    const id = await service.createMedia({
      identityId: 'id1',
      fileStream: stream,
      fileName: 'a.jpg',
      mimeType: MimeTypes.IMAGE_JPEG,
    })
    expect(id).toBe('m-1')
  })
})
