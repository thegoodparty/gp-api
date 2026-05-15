import { BadGatewayException, BadRequestException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildWebSearchTool,
  InMemorySearchProvider,
  TavilySearchProvider,
  type SearchResult,
} from './webSearch.tool'

describe('webSearch tool', () => {
  it('returns results from the provider for a given query', async () => {
    const results: SearchResult[] = [
      {
        title: 'Independent candidates surge in 2026',
        url: 'https://example.com/article-1',
        snippet: 'A record number of independents filed for office...',
        score: 0.95,
      },
      {
        title: 'How ranked-choice voting changed the race',
        url: 'https://example.com/article-2',
        snippet: 'Voters in three states adopted RCV in 2024.',
        score: 0.82,
      },
    ]
    const provider = new InMemorySearchProvider(
      new Map([['independent candidates', results]]),
    )
    const tool = buildWebSearchTool({ provider })

    const out = await tool.execute({ query: 'independent candidates' })

    expect(out).toEqual(results)
  })

  it('returns an empty array when the provider has no matches', async () => {
    const provider = new InMemorySearchProvider(new Map())
    const tool = buildWebSearchTool({ provider })

    const out = await tool.execute({ query: 'no matches here' })

    expect(out).toEqual([])
  })

  it('clamps maxResults to 10 and respects the requested count', async () => {
    const results: SearchResult[] = Array.from({ length: 15 }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
      snippet: `snippet ${i}`,
      score: 1 - i * 0.01,
    }))
    const provider = new InMemorySearchProvider(new Map([['mass', results]]))
    const tool = buildWebSearchTool({ provider })

    const requested20 = await tool.execute({ query: 'mass', maxResults: 20 })
    expect(requested20).toHaveLength(10)

    const requested3 = await tool.execute({ query: 'mass', maxResults: 3 })
    expect(requested3).toHaveLength(3)
    expect(requested3[0].title).toBe('Result 0')
  })

  it('defaults to 5 results when maxResults is not provided', async () => {
    const results: SearchResult[] = Array.from({ length: 8 }, (_, i) => ({
      title: `R${i}`,
      url: `https://example.com/${i}`,
      snippet: `s${i}`,
      score: 0.5,
    }))
    const provider = new InMemorySearchProvider(new Map([['default', results]]))
    const tool = buildWebSearchTool({ provider })

    const out = await tool.execute({ query: 'default' })

    expect(out).toHaveLength(5)
  })

  it('rejects an empty query via the input schema', () => {
    const provider = new InMemorySearchProvider(new Map())
    const tool = buildWebSearchTool({ provider })

    const parsed = tool.inputSchema.safeParse({ query: '' })

    expect(parsed.success).toBe(false)
  })
})

describe('TavilySearchProvider', () => {
  const originalKey = process.env.TAVILY_API_KEY
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    process.env.TAVILY_API_KEY = 'test-key'
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.TAVILY_API_KEY
    } else {
      process.env.TAVILY_API_KEY = originalKey
    }
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  it('aborts the fetch after the configured timeout', async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    )
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

    const provider = new TavilySearchProvider({ timeoutMs: 25 })
    await expect(provider.search('hello', 3)).rejects.toThrow(
      /timeout|aborted/i,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('respects an externally provided AbortSignal and cancels the fetch', async () => {
    const controller = new AbortController()
    let observedSignal: AbortSignal | undefined
    const fetchMock = vi
      .fn()
      .mockImplementation((_url: string, init?: { signal?: AbortSignal }) => {
        observedSignal = init?.signal
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      })
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

    const provider = new TavilySearchProvider({ timeoutMs: 60_000 })
    const promise = provider.search('hello', 3, { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toThrow(/aborted/i)
    expect(observedSignal).toBeDefined()
    expect(observedSignal?.aborted).toBe(true)
  })

  it('passes the user-provided AbortSignal through to fetch', async () => {
    const controller = new AbortController()
    let observedSignal: AbortSignal | undefined
    const fetchMock = vi
      .fn()
      .mockImplementation(
        (_url: string, init?: { signal?: AbortSignal }) => {
          observedSignal = init?.signal
          return Promise.resolve({
            ok: true,
            json: async () => ({ results: [] }),
            text: async () => '',
          })
        },
      )
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

    const provider = new TavilySearchProvider({ timeoutMs: 60_000 })
    await provider.search('hello', 3, { signal: controller.signal })

    expect(observedSignal).toBeDefined()
    controller.abort()
    expect(observedSignal?.aborted).toBe(true)
  })

  it('accepts apiKey via constructor and forwards it to Tavily', async () => {
    delete process.env.TAVILY_API_KEY
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
      text: async () => '',
    })
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

    const provider = new TavilySearchProvider({ apiKey: 'ctor-key' })
    await provider.search('hello', 3)

    const init = fetchMock.mock.calls[0][1] as { body: string }
    const body = JSON.parse(init.body) as { api_key: string }
    expect(body.api_key).toBe('ctor-key')
  })

  it('throws BadRequestException on a 4xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({}),
      text: async () => 'invalid query',
    })
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

    const provider = new TavilySearchProvider()
    await expect(provider.search('hello', 3)).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('throws BadGatewayException on a 5xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => ({}),
      text: async () => 'down',
    })
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

    const provider = new TavilySearchProvider()
    await expect(provider.search('hello', 3)).rejects.toBeInstanceOf(
      BadGatewayException,
    )
  })

  it('does not include the response body in the thrown error message', async () => {
    const sensitive = 'super-secret-token-abc123'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({}),
      text: async () => sensitive,
    })
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

    const provider = new TavilySearchProvider()
    await expect(provider.search('hello', 3)).rejects.toMatchObject({
      message: expect.not.stringContaining(sensitive),
    })
  })

  it('returns [] when response has no results field', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    })
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

    const provider = new TavilySearchProvider()
    const results = await provider.search('hello', 3)

    expect(results).toEqual([])
  })

  it('clears the timeout when the request completes successfully', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'Result',
            url: 'https://example.com/1',
            content: 'body',
            score: 0.9,
          },
        ],
      }),
      text: async () => '',
    })
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
    const setSpy = vi.spyOn(globalThis, 'setTimeout')
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

    const provider = new TavilySearchProvider({ timeoutMs: 5000 })
    const results = await provider.search('hello', 3)

    expect(results).toHaveLength(1)
    expect(setSpy).toHaveBeenCalled()
    expect(clearSpy).toHaveBeenCalled()
  })
})
