import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common'
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host'
import { of, throwError } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BlockedStateInterceptor } from './blockedState.interceptor'

const recordBlockedStateEventMock = vi.fn()

vi.mock('../grafana/otel.client', () => ({
  recordBlockedStateEvent: (...args: unknown[]) =>
    recordBlockedStateEventMock(...args),
}))

function makeContext(params: {
  userId?: number
  method?: string
  url?: string
}): ExecutionContext {
  const req = {
    user: params.userId ? { id: params.userId } : undefined,
    method: params.method ?? 'GET',
    url: params.url ?? '/v1/somewhere',
  }

  class Controller {}
  const handler = () => undefined

  return new ExecutionContextHost([req, {}, {}], Controller, handler)
}

describe('BlockedStateInterceptor', () => {
  beforeEach(() => {
    recordBlockedStateEventMock.mockClear()
  })

  it('does not record BlockedState when user is not authenticated', async () => {
    const interceptor = new BlockedStateInterceptor()
    const ctx = makeContext({})

    await new Promise<void>((resolve) => {
      const next: CallHandler = {
        handle: () =>
          throwError(() => new InternalServerErrorException('boom')),
      }
      interceptor.intercept(ctx, next).subscribe({
        error: () => resolve(),
      })
    })

    expect(recordBlockedStateEventMock).not.toHaveBeenCalled()
  })

  it('records BlockedState for authenticated 5xx errors', async () => {
    const interceptor = new BlockedStateInterceptor()
    const ctx = makeContext({ userId: 123, url: '/v1/foo', method: 'GET' })

    await new Promise<void>((resolve) => {
      const next: CallHandler = {
        handle: () =>
          throwError(() => new InternalServerErrorException('boom')),
      }
      interceptor.intercept(ctx, next).subscribe({
        error: () => resolve(),
      })
    })

    expect(recordBlockedStateEventMock).toHaveBeenCalledTimes(1)
    const [attrs] = recordBlockedStateEventMock.mock.calls[0]
    expect(attrs).toMatchObject({
      service: 'gp-api',
      userId: 123,
      statusCode: 500,
      isBackground: false,
    })
  })

  it('records BlockedState for authenticated allowlisted 4xx errorCode', async () => {
    const interceptor = new BlockedStateInterceptor()
    const ctx = makeContext({ userId: 123, url: '/v1/foo', method: 'GET' })

    const err = new BadRequestException({
      message: 'whatever',
      errorCode: 'DATA_INTEGRITY_P2V_ELECTION_INFO_MISSING',
    })

    await new Promise<void>((resolve) => {
      const next: CallHandler = { handle: () => throwError(() => err) }
      interceptor.intercept(ctx, next).subscribe({
        error: () => resolve(),
      })
    })

    expect(recordBlockedStateEventMock).toHaveBeenCalledTimes(1)
  })

  it('does not record BlockedState for authenticated non-allowlisted 4xx', async () => {
    const interceptor = new BlockedStateInterceptor()
    const ctx = makeContext({ userId: 123, url: '/v1/foo', method: 'GET' })

    const err = new BadRequestException({
      message: 'whatever',
      errorCode: 'NOT_ALLOWLISTED',
    })

    await new Promise<void>((resolve) => {
      const next: CallHandler = { handle: () => throwError(() => err) }
      interceptor.intercept(ctx, next).subscribe({
        error: () => resolve(),
      })
    })

    expect(recordBlockedStateEventMock).not.toHaveBeenCalled()
  })

  it('does not record BlockedState on success', async () => {
    const interceptor = new BlockedStateInterceptor()
    const ctx = makeContext({ userId: 123 })

    await new Promise<void>((resolve) => {
      const next: CallHandler = { handle: () => of({ ok: true }) }
      interceptor.intercept(ctx, next).subscribe({
        complete: () => resolve(),
      })
    })

    expect(recordBlockedStateEventMock).not.toHaveBeenCalled()
  })
})
