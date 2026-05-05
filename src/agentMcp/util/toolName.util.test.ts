import { describe, expect, it } from 'vitest'
import { deriveToolName } from './toolName.util'

describe('deriveToolName', () => {
  it.each([
    ['GET', '/v1/campaigns/mine', 'GET_v1_campaigns_mine'],
    ['POST', '/v1/campaigns/mine', 'POST_v1_campaigns_mine'],
    ['PATCH', '/v1/users/:id', 'PATCH_v1_users_id'],
    ['DELETE', '/v1/files/:id', 'DELETE_v1_files_id'],
  ])('derives "%s %s" → "%s"', (method, path, expected) => {
    expect(deriveToolName(method, path)).toBe(expected)
  })

  it('uppercases lowercase methods', () => {
    expect(deriveToolName('get', '/v1/foo')).toBe('GET_v1_foo')
  })

  it('throws on empty path', () => {
    expect(() => deriveToolName('GET', '')).toThrow(/path/i)
  })
})
