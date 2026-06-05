import { describe, expect, it, vi } from 'vitest'
import {
  isInternalChatLink,
  sanitizeChatLinks,
  stripTrackingParams,
  validateChatLinks,
} from './sanitizeChatLinks.util'

describe('sanitizeChatLinks', () => {
  it('keeps safe absolute https links (internal and external)', () => {
    const internal = '[GP](https://goodparty.org/dashboard)'
    const external = '[News](https://example.com/article)'
    expect(sanitizeChatLinks(internal)).toBe(internal)
    expect(sanitizeChatLinks(external)).toBe(external)
  })

  it('keeps mailto and tel links', () => {
    expect(sanitizeChatLinks('[Email](mailto:a@b.com)')).toBe(
      '[Email](mailto:a@b.com)',
    )
    expect(sanitizeChatLinks('[Call](tel:+15551234567)')).toBe(
      '[Call](tel:+15551234567)',
    )
  })

  it('downgrades relative links to plain text', () => {
    expect(sanitizeChatLinks('Read [the plan](/dashboard/plan) now')).toBe(
      'Read the plan now',
    )
  })

  it('downgrades unsafe protocols to plain text', () => {
    expect(sanitizeChatLinks('[click](javascript:alertOne)')).toBe('click')
    expect(sanitizeChatLinks('[x](data:text/html;base64,abc)')).toBe('x')
  })

  it('downgrades external http (non-secure) links to text but keeps internal http', () => {
    expect(sanitizeChatLinks('[ext](http://example.com)')).toBe('ext')
    expect(sanitizeChatLinks('[int](http://goodparty.org/x)')).toBe(
      '[int](http://goodparty.org/x)',
    )
  })

  it('leaves bare text and image links untouched', () => {
    expect(sanitizeChatLinks('just plain text')).toBe('just plain text')
    expect(sanitizeChatLinks('![alt](/img.png)')).toBe('![alt](/img.png)')
  })

  it('handles multiple links in one string', () => {
    const input = 'See [a](/rel) and [b](https://goodparty.org/b).'
    expect(sanitizeChatLinks(input)).toBe(
      'See a and [b](https://goodparty.org/b).',
    )
  })

  it('returns empty/blank input unchanged', () => {
    expect(sanitizeChatLinks('')).toBe('')
  })

  it('strips tracking params from kept links', () => {
    const input =
      '[Guide](https://goodparty.org/blog/x?_gl=1*abc&utm_source=ai&page=2)'
    expect(sanitizeChatLinks(input)).toBe(
      '[Guide](https://goodparty.org/blog/x?page=2)',
    )
  })

  it('strips a dangling ? when all params were tracking', () => {
    expect(sanitizeChatLinks('[X](https://goodparty.org/x?_gl=1*abc)')).toBe(
      '[X](https://goodparty.org/x)',
    )
  })
})

describe('stripTrackingParams', () => {
  it('removes utm_, _gl, _ga, gclid, fbclid and keeps functional params', () => {
    expect(
      stripTrackingParams(
        'https://x.com/p?utm_medium=a&_gl=1&_ga=2&gclid=3&fbclid=4&id=9&q=hi',
      ),
    ).toBe('https://x.com/p?id=9&q=hi')
  })

  it('leaves non-tracking urls untouched', () => {
    expect(stripTrackingParams('https://x.com/p?id=9')).toBe(
      'https://x.com/p?id=9',
    )
  })

  it('returns non-url input unchanged', () => {
    expect(stripTrackingParams('/relative')).toBe('/relative')
  })
})

describe('isInternalChatLink', () => {
  it('is true for goodparty.org and subdomains', () => {
    expect(isInternalChatLink('https://goodparty.org/x')).toBe(true)
    expect(isInternalChatLink('https://blog.goodparty.org/x')).toBe(true)
  })

  it('is false for external hosts and non-http links', () => {
    expect(isInternalChatLink('https://example.com/x')).toBe(false)
    expect(isInternalChatLink('mailto:a@b.com')).toBe(false)
    expect(isInternalChatLink('/relative')).toBe(false)
  })
})

describe('validateChatLinks', () => {
  it('downgrades links the validator reports as unreachable', async () => {
    const reachable = vi.fn(async (url: string) => !url.endsWith('/dead'))
    const input =
      'Try [good](https://goodparty.org/good) and [dead](https://goodparty.org/dead).'
    const out = await validateChatLinks(input, reachable)
    expect(out).toBe('Try [good](https://goodparty.org/good) and dead.')
  })

  it('keeps links when the validator returns true and only checks each url once', async () => {
    const reachable = vi.fn(async () => true)
    const input =
      '[a](https://goodparty.org/x) [b](https://goodparty.org/x) [c](https://goodparty.org/y)'
    const out = await validateChatLinks(input, reachable)
    expect(out).toBe(input)
    // two unique urls -> two checks
    expect(reachable).toHaveBeenCalledTimes(2)
  })

  it('treats a validator throw as reachable (no false-positive stripping)', async () => {
    const reachable = vi.fn(async () => {
      throw new Error('boom')
    })
    const input = '[x](https://goodparty.org/x)'
    expect(await validateChatLinks(input, reachable)).toBe(input)
  })

  it('leaves content without links unchanged', async () => {
    const reachable = vi.fn(async () => false)
    expect(await validateChatLinks('no links here', reachable)).toBe(
      'no links here',
    )
    expect(reachable).not.toHaveBeenCalled()
  })
})
