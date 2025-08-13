import { buildSlug } from './slug.util'

describe('slug.util', () => {
  it('buildSlug lowercases and hyphenates', () => {
    expect(buildSlug('Hello World')).toBe('hello-world')
  })

  it('buildSlug appends suffix when provided', () => {
    expect(buildSlug('Hello World', '123')).toBe('hello-world-123')
  })
})


