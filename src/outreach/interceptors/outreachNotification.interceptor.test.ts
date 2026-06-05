import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common'
import { User } from '../../generated/prisma'
import { firstValueFrom, of, throwError } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { OutreachNotificationService } from '../services/outreachNotification.service'
import { OutreachStepError } from '../types/outreachStepError'
import { OutreachNotificationInterceptor } from './outreachNotification.interceptor'

const mockUser = { id: 1, email: 'jane@example.com' } as User

interface RequestOverrides {
  user?: User
  body?: unknown
  campaign?: unknown
}

const buildContext = (overrides: RequestOverrides = {}): ExecutionContext => {
  const req = {
    user: 'user' in overrides ? overrides.user : mockUser,
    body: 'body' in overrides ? overrides.body : { outreachType: 'p2p' },
    campaign: overrides.campaign,
  }
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext
}

const errorHandler = (err: unknown): CallHandler =>
  ({ handle: () => throwError(() => err) }) as unknown as CallHandler

describe('OutreachNotificationInterceptor', () => {
  let interceptor: OutreachNotificationInterceptor
  const mockNotifyFailure = vi.fn()

  beforeEach(() => {
    mockNotifyFailure.mockReset().mockResolvedValue(undefined)
    interceptor = new OutreachNotificationInterceptor(
      {
        notifyFailure: mockNotifyFailure,
      } as unknown as OutreachNotificationService,
      createMockLogger(),
    )
  })

  describe('successful requests', () => {
    it('passes through values from next.handle without invoking notify', async () => {
      const next = {
        handle: () => of('ok'),
      } as unknown as CallHandler

      await expect(
        firstValueFrom(interceptor.intercept(buildContext(), next)),
      ).resolves.toBe('ok')

      expect(mockNotifyFailure).not.toHaveBeenCalled()
    })
  })

  describe('failed requests', () => {
    it('re-throws the original error after firing failure Slack', async () => {
      const err = new Error('boom')

      await expect(
        firstValueFrom(
          interceptor.intercept(buildContext(), errorHandler(err)),
        ),
      ).rejects.toBe(err)

      expect(mockNotifyFailure).toHaveBeenCalledTimes(1)
    })

    it('re-throws the original error even when notifyFailure rejects', async () => {
      mockNotifyFailure.mockRejectedValueOnce(new Error('slack down'))
      const err = new Error('original')

      await expect(
        firstValueFrom(
          interceptor.intercept(buildContext(), errorHandler(err)),
        ),
      ).rejects.toBe(err)
    })

    it('skips notifyFailure when req.user is absent', async () => {
      const err = new Error('boom')

      await expect(
        firstValueFrom(
          interceptor.intercept(
            buildContext({ user: undefined }),
            errorHandler(err),
          ),
        ),
      ).rejects.toBe(err)

      expect(mockNotifyFailure).not.toHaveBeenCalled()
    })

    it('passes user, campaign, and body through to notifyFailure', async () => {
      const campaign = { id: 99 }
      const body = { outreachType: 'p2p', script: 'hi' }
      const err = new Error('boom')

      await expect(
        firstValueFrom(
          interceptor.intercept(
            buildContext({ campaign, body }),
            errorHandler(err),
          ),
        ),
      ).rejects.toBe(err)

      expect(mockNotifyFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          user: mockUser,
          campaign,
          createOutreachDto: body,
          error: err,
        }),
      )
    })
  })

  describe('classifyFailure', () => {
    it("classifies 4xx HttpException as 'validation'", async () => {
      const err = new BadRequestException('bad input')

      await expect(
        firstValueFrom(
          interceptor.intercept(buildContext(), errorHandler(err)),
        ),
      ).rejects.toBe(err)

      expect(mockNotifyFailure).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'validation' }),
      )
    })

    it('uses the step from OutreachStepError', async () => {
      const err = new OutreachStepError(
        'peerlyJobCreation',
        new Error('peerly down'),
      )

      await expect(
        firstValueFrom(
          interceptor.intercept(buildContext(), errorHandler(err)),
        ),
      ).rejects.toBe(err)

      expect(mockNotifyFailure).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'peerlyJobCreation' }),
      )
    })

    it("classifies a plain Error as 'unknown'", async () => {
      const err = new Error('mystery')

      await expect(
        firstValueFrom(
          interceptor.intercept(buildContext(), errorHandler(err)),
        ),
      ).rejects.toBe(err)

      expect(mockNotifyFailure).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'unknown' }),
      )
    })
  })
})
