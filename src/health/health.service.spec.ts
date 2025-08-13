import { Test, TestingModule } from '@nestjs/testing'
import { HealthService } from './health.service'
import { PrismaService } from '../prisma/prisma.service'

describe('HealthService', () => {
  let service: HealthService
  let prisma: { $queryRaw: jest.Mock }

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()

    service = module.get<HealthService>(HealthService)
  })

  it('returns true when query succeeds', async () => {
    prisma.$queryRaw.mockResolvedValueOnce(1)
    await expect(service.checkHealth()).resolves.toBe(true)
  })

  it('returns false when query fails', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('db down'))
    await expect(service.checkHealth()).resolves.toBe(false)
  })
})


