import { CallHandler, ExecutionContext } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { ZodResponseInterceptor } from './ZodResponse.interceptor'
import { RESPONSE_SCHEMA_KEY } from '../decorators/ResponseSchema.decorator'
import { Reflector } from '@nestjs/core'
import { InternalServerErrorException } from '@nestjs/common'
import { of, lastValueFrom } from 'rxjs'
import { z } from 'zod'
import { createMockLogger } from '../test-utils/mockLogger.util'

const UserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  name: z.string(),
})

const createMockExecutionContext = (): ExecutionContext =>
  ({
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: vi.fn(),
    switchToRpc: vi.fn(),
    switchToWs: vi.fn(),
    getType: vi.fn(),
    getArgs: vi.fn(),
    getArgByIndex: vi.fn(),
  }) satisfies Record<keyof ExecutionContext, unknown> as ExecutionContext

const createMockCallHandler = (data: unknown): CallHandler => ({
  handle: () => of(data),
})

describe('ZodResponseInterceptor', () => {
  let interceptor: ZodResponseInterceptor
  let reflector: Reflector

  const setup = (schema: z.ZodSchema | undefined) => {
    reflector = new Reflector()
    vi.spyOn(reflector, 'get').mockReturnValue(schema)
    interceptor = new ZodResponseInterceptor(reflector, createMockLogger())
  }

  it('strips fields not defined in the schema', async () => {
    setup(UserSchema)

    const rawData = {
      id: 1,
      email: 'john@example.com',
      name: 'John',
      password: 'hashed_secret',
      passwordResetToken: 'abc123',
    }

    const context = createMockExecutionContext()
    const handler = createMockCallHandler(rawData)

    const result$ = interceptor.intercept(context, handler)
    const result = await lastValueFrom(result$)

    expect(result).toEqual({
      id: 1,
      email: 'john@example.com',
      name: 'John',
    })
    expect(result).not.toHaveProperty('password')
    expect(result).not.toHaveProperty('passwordResetToken')
  })

  it('throws InternalServerErrorException when data fails validation', async () => {
    setup(UserSchema)

    const invalidData = {
      id: 'not-a-number',
      email: 'invalid',
    }

    const context = createMockExecutionContext()
    const handler = createMockCallHandler(invalidData)

    const result$ = interceptor.intercept(context, handler)

    await expect(lastValueFrom(result$)).rejects.toThrow(
      InternalServerErrorException,
    )
  })

  it('passes data through unchanged when no schema is set', async () => {
    setup(undefined)

    const rawData = {
      id: 1,
      password: 'should_remain',
      anything: 'goes',
    }

    const context = createMockExecutionContext()
    const handler = createMockCallHandler(rawData)

    const result$ = interceptor.intercept(context, handler)
    const result = await lastValueFrom(result$)

    expect(result).toEqual(rawData)
  })

  it('reads schema from route metadata using RESPONSE_SCHEMA_KEY', () => {
    setup(UserSchema)

    const context = createMockExecutionContext()
    const handler = createMockCallHandler({})

    interceptor.intercept(context, handler)

    expect(reflector.get).toHaveBeenCalledWith(
      RESPONSE_SCHEMA_KEY,
      context.getHandler(),
    )
  })
})
