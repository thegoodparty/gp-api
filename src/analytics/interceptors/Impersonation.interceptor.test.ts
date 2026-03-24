import { CallHandler, ExecutionContext } from '@nestjs/common'
import { of, lastValueFrom, from } from 'rxjs'
import { describe, expect, it } from 'vitest'
import { ImpersonationInterceptor } from './Impersonation.interceptor'
import { getImpersonationContext } from '../impersonation-context'

function createMockContext(user?: {
  impersonating?: boolean
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext
}

function createMockHandler(fn?: () => unknown): CallHandler {
  return {
    handle: () => of(fn ? fn() : 'ok'),
  }
}

describe('ImpersonationInterceptor', () => {
  const interceptor = new ImpersonationInterceptor()

  it('sets isImpersonating to true when JWT has impersonating claim', async () => {
    let captured: boolean | undefined

    const context = createMockContext({ impersonating: true })
    const handler = createMockHandler(() => {
      captured = getImpersonationContext()
      return 'result'
    })

    const result$ = interceptor.intercept(context, handler)
    const result = await lastValueFrom(result$)

    expect(captured).toBe(true)
    expect(result).toBe('result')
  })

  it('sets isImpersonating to false when no user on request', async () => {
    let captured: boolean | undefined

    const context = createMockContext(undefined)
    const handler = createMockHandler(() => {
      captured = getImpersonationContext()
      return 'result'
    })

    const result$ = interceptor.intercept(context, handler)
    await lastValueFrom(result$)

    expect(captured).toBe(false)
  })

  it('does not leak context after the observable completes', async () => {
    const context = createMockContext({ impersonating: true })
    const handler = createMockHandler(() => 'done')

    const result$ = interceptor.intercept(context, handler)
    await lastValueFrom(result$)

    expect(getImpersonationContext()).toBeUndefined()
  })

  it('propagates context through async handler', async () => {
    let captured: boolean | undefined

    const context = createMockContext({ impersonating: true })
    const handler: CallHandler = {
      handle: () =>
        from(
          (async () => {
            await new Promise((r) => setTimeout(r, 1))
            captured = getImpersonationContext()
            return 'async-result'
          })(),
        ),
    }

    const result$ = interceptor.intercept(context, handler)
    const result = await lastValueFrom(result$)

    expect(captured).toBe(true)
    expect(result).toBe('async-result')
  })
})
