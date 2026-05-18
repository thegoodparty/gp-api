import { BadGatewayException, BadRequestException } from '@nestjs/common'
import { z } from 'zod'
import type { LlmStreamTool } from '@/llm/services/llm.service'

export interface SearchResult {
  title: string
  url: string
  snippet: string
  score: number
}

export interface WebSearchInput {
  query: string
  maxResults?: number
}

export type WebSearchOutput = SearchResult[]

export interface SearchOptions {
  signal?: AbortSignal
}

export interface SearchProvider {
  search: (
    query: string,
    maxResults: number,
    options?: SearchOptions,
  ) => Promise<SearchResult[]>
}

const DEFAULT_MAX_RESULTS = 5
const HARD_MAX_RESULTS = 10

const webSearchInputSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().positive().optional(),
})

const clampMaxResults = (requested?: number): number => {
  if (requested === undefined) return DEFAULT_MAX_RESULTS
  return Math.min(requested, HARD_MAX_RESULTS)
}

export const buildWebSearchTool = (deps: {
  provider: SearchProvider
}): LlmStreamTool<WebSearchInput, WebSearchOutput> => ({
  description:
    'Search the public web for current information — news, recent events, opponent activity, polling, factual lookups. Returns top-ranked results with snippets.',
  inputSchema: webSearchInputSchema,
  execute: async ({ query, maxResults }) => {
    const limit = clampMaxResults(maxResults)
    return deps.provider.search(query, limit)
  },
})

const tavilyResponseSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        url: z.string().optional(),
        content: z.string().optional(),
        score: z.number().optional(),
      }),
    )
    .optional(),
})

const DEFAULT_TAVILY_TIMEOUT_MS = 5000

export interface TavilySearchProviderOptions {
  apiKey?: string
  timeoutMs?: number
}

const isClientError = (status: number): boolean => status >= 400 && status < 500

export class TavilySearchProvider implements SearchProvider {
  private readonly endpoint = 'https://api.tavily.com/search'
  private readonly timeoutMs: number
  private readonly apiKey: string | undefined

  constructor(options?: TavilySearchProviderOptions) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TAVILY_TIMEOUT_MS
    this.apiKey = options?.apiKey ?? process.env.TAVILY_API_KEY
  }

  async search(
    query: string,
    maxResults: number,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    if (!this.apiKey) {
      throw new BadGatewayException('TAVILY_API_KEY is not set')
    }

    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => {
      timeoutController.abort(
        new Error(`Tavily request timeout after ${this.timeoutMs}ms`),
      )
    }, this.timeoutMs)

    const signal = this.composeSignal(options?.signal, timeoutController.signal)

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: maxResults,
          search_depth: 'basic',
          include_answer: false,
        }),
        signal,
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        // No PinoLogger in this class yet; console.error keeps the raw
        // body visible in logs while the thrown message stays redacted.
        console.error(
          `Tavily request failed: ${response.status} ` +
            `${response.statusText} — body: ${body}`,
        )
        const summary =
          `Tavily request failed: ${response.status} ` +
          `${response.statusText}`
        if (isClientError(response.status)) {
          throw new BadRequestException(summary)
        }
        throw new BadGatewayException(summary)
      }

      const raw: unknown = await response.json()
      const data = tavilyResponseSchema.parse(raw)
      const results = data.results ?? []
      return results.map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.content ?? '',
        score: r.score ?? 0,
      }))
    } catch (err) {
      if (timeoutController.signal.aborted && !options?.signal?.aborted) {
        throw new BadGatewayException(
          `Tavily request timeout after ${this.timeoutMs}ms`,
        )
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private composeSignal(
    userSignal: AbortSignal | undefined,
    timeoutSignal: AbortSignal,
  ): AbortSignal {
    if (!userSignal) return timeoutSignal
    const anyFn: ((signals: AbortSignal[]) => AbortSignal) | undefined = (
      AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }
    ).any
    if (typeof anyFn === 'function') {
      return anyFn([userSignal, timeoutSignal])
    }
    const composed = new AbortController()
    const onAbort = () => composed.abort()
    if (userSignal.aborted) onAbort()
    else userSignal.addEventListener('abort', onAbort)
    if (timeoutSignal.aborted) onAbort()
    else timeoutSignal.addEventListener('abort', onAbort)
    return composed.signal
  }
}

export class InMemorySearchProvider implements SearchProvider {
  constructor(private readonly responses: Map<string, SearchResult[]>) {}

  search(
    query: string,
    maxResults: number,
    _options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const hit = this.responses.get(query) ?? []
    return Promise.resolve(hit.slice(0, maxResults))
  }
}
