import { Test, TestingModule } from '@nestjs/testing'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'
import { HttpException, HttpStatus } from '@nestjs/common'

describe('HealthController', () => {
  let controller: HealthController
  let service: HealthService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            checkHealth: jest.fn<() => Promise<boolean>, []>(),
          },
        },
      ],
    }).compile()

    controller = module.get<HealthController>(HealthController)
    service = module.get<HealthService>(HealthService)
  })

  it('returns OK when service healthy', async () => {
    ;(service.checkHealth as jest.Mock).mockResolvedValue(true)
    await expect(controller.getHealth()).resolves.toBe('OK')
  })

  it('throws 503 when service unhealthy', async () => {
    ;(service.checkHealth as jest.Mock).mockResolvedValue(false)
    await expect(controller.getHealth()).rejects.toEqual(
      new HttpException('HEALTH CHECK FAILED', HttpStatus.SERVICE_UNAVAILABLE),
    )
  })
})
