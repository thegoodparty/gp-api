import { CallHandler, ExecutionContext } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { of } from 'rxjs'
import { Headers, MimeTypes } from 'http-constants-ts'
import { FilesInterceptor, setNestedProperty } from './files.interceptor'

const FORBIDDEN = ['__proto__', 'constructor', 'prototype'] as const

describe('setNestedProperty', () => {
  it.each(FORBIDDEN)('rejects flat forbidden key: %s', (key) => {
    const obj = {}
    setNestedProperty(obj, key, 'evil')
    expect(obj).toEqual({})
  })

  it.each(FORBIDDEN)(
    'rejects bracket-notation forbidden key: %s[value]',
    (key) => {
      const obj = {}
      setNestedProperty(obj, `${key}[isAdmin]`, 'true')
      expect(obj).toEqual({})
    },
  )

  it.each(FORBIDDEN)('rejects nested forbidden key: data[%s]', (key) => {
    const obj = {}
    setNestedProperty(obj, `data[${key}]`, 'true')
    expect(obj).toEqual({})
  })

  it('allows normal flat keys', () => {
    const obj = {}
    setNestedProperty(obj, 'name', 'alice')
    expect(obj).toEqual({ name: 'alice' })
  })

  it('allows normal bracket-notation keys', () => {
    const obj = {}
    setNestedProperty(obj, 'user[name]', 'alice')
    expect(obj).toEqual({ user: { name: 'alice' } })
  })

  it('does not pollute Object.prototype', () => {
    const before = { ...Object.prototype }
    const obj = {}
    setNestedProperty(obj, '__proto__[polluted]', 'yes')
    setNestedProperty(obj, 'constructor[polluted]', 'yes')
    setNestedProperty(obj, 'prototype[polluted]', 'yes')
    expect(Object.prototype).toEqual(before)
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })
})

describe('FilesInterceptor forbidden field guard', () => {
  const createMockContext = (
    parts: Array<{ type: 'field'; fieldname: string; value: string }>,
  ) => {
    const body: Record<string, unknown> = {}
    const req = {
      headers: {
        [Headers.CONTENT_TYPE.toLowerCase()]: MimeTypes.IMAGE_FORM_DATA,
      },
      body,
      parts: () => ({
        async *[Symbol.asyncIterator]() {
          for (const part of parts) {
            yield part
          }
        },
      }),
    }

    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: vi.fn(),
      getClass: vi.fn(),
    } as unknown as ExecutionContext

    const next: CallHandler = { handle: () => of(undefined) }

    return { ctx, next, req }
  }

  it.each(FORBIDDEN)('drops flat forbidden field: %s', async (key) => {
    const { ctx, next, req } = createMockContext([
      { type: 'field', fieldname: key, value: 'evil' },
    ])
    const Interceptor = FilesInterceptor('file')
    const instance = new Interceptor()
    await instance.intercept(ctx, next)
    expect(req.body).toEqual({})
  })

  it.each(FORBIDDEN)(
    'drops bracket-notation forbidden field: %s[x]',
    async (key) => {
      const { ctx, next, req } = createMockContext([
        {
          type: 'field',
          fieldname: `${key}[isAdmin]`,
          value: 'true',
        },
      ])
      const Interceptor = FilesInterceptor('file')
      const instance = new Interceptor()
      await instance.intercept(ctx, next)
      expect(req.body).toEqual({})
    },
  )

  it('allows legitimate fields through', async () => {
    const { ctx, next, req } = createMockContext([
      { type: 'field', fieldname: 'name', value: 'alice' },
      {
        type: 'field',
        fieldname: 'address[city]',
        value: 'NYC',
      },
    ])
    const Interceptor = FilesInterceptor('file')
    const instance = new Interceptor()
    await instance.intercept(ctx, next)
    expect(req.body).toEqual({
      name: 'alice',
      address: { city: 'NYC' },
    })
  })
})
