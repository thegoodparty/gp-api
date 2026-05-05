import { describe, expect, it } from 'vitest'
import { deriveToolName } from './toolName.util'

describe('deriveToolName', () => {
  it.each([
    ['GET', '/v1/campaigns/mine', 'GET /v1/campaigns/mine'],
    ['POST', '/v1/campaigns/mine', 'POST /v1/campaigns/mine'],
    ['PATCH', '/v1/users/:id', 'PATCH /v1/users/:id'],
    ['DELETE', '/v1/files/:id', 'DELETE /v1/files/:id'],
  ])('derives "%s %s" → "%s"', (method, path, expected) => {
    expect(deriveToolName(method, path)).toBe(expected)
  })

  it('uppercases lowercase methods', () => {
    expect(deriveToolName('get', '/v1/foo')).toBe('GET /v1/foo')
  })

  it('throws on empty path', () => {
    expect(() => deriveToolName('GET', '')).toThrow(/path/i)
  })
})
