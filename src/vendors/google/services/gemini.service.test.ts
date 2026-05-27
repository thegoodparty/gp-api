import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BadGatewayException } from '@nestjs/common'
import { z } from 'zod'
import { GeminiClient, GeminiService } from './gemini.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

type GenerateContent = GeminiClient['models']['generateContent']

const buildClient = (generateContent: GenerateContent): GeminiClient => ({
  models: { generateContent },
})

describe('GeminiService', () => {
  let generateContent: ReturnType<typeof vi.fn<GenerateContent>>
  let service: GeminiService

  beforeEach(() => {
    generateContent = vi.fn<GenerateContent>()
    service = new GeminiService(
      createMockLogger(),
      buildClient(generateContent),
    )
  })

  describe('generateWithSearch', () => {
    it('returns text, search queries, and sources from grounded response', async () => {
      generateContent.mockResolvedValueOnce({
        text: 'response body',
        candidates: [
          {
            groundingMetadata: {
              webSearchQueries: ['query a', 'query b'],
              groundingChunks: [
                { web: { title: 'Source A', uri: 'https://a.example' } },
                { web: { title: 'Source B', uri: 'https://b.example' } },
              ],
            },
          },
        ],
      })

      const result = await service.generateWithSearch('hello')

      expect(result).toEqual({
        text: 'response body',
        searchQueries: ['query a', 'query b'],
        sources: [
          { title: 'Source A', uri: 'https://a.example' },
          { title: 'Source B', uri: 'https://b.example' },
        ],
      })
      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: 'hello',
          config: expect.objectContaining({
            tools: [{ googleSearch: {} }],
          }),
        }),
      )
    })

    it('returns empty arrays when grounding metadata is missing', async () => {
      generateContent.mockResolvedValueOnce({
        text: 'plain text',
        candidates: [{}],
      })

      const result = await service.generateWithSearch('hi')

      expect(result.searchQueries).toEqual([])
      expect(result.sources).toEqual([])
    })

    it('drops grounding chunks with missing title or uri', async () => {
      generateContent.mockResolvedValueOnce({
        text: 'response',
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [
                { web: { title: 'Has both', uri: 'https://ok.example' } },
                { web: { uri: 'https://no-title.example' } },
                { web: { title: 'No uri' } },
                {},
              ],
            },
          },
        ],
      })

      const result = await service.generateWithSearch('q')

      expect(result.sources).toEqual([
        { title: 'Has both', uri: 'https://ok.example' },
      ])
    })

    it('throws BadGateway when Gemini returns empty text', async () => {
      generateContent.mockResolvedValueOnce({
        text: undefined,
        candidates: [{}],
      })

      await expect(service.generateWithSearch('q')).rejects.toThrow(
        BadGatewayException,
      )
    })

    it('wraps SDK errors in BadGateway without leaking upstream detail', async () => {
      generateContent.mockRejectedValue(new Error('rate limited'))

      await expect(service.generateWithSearch('q')).rejects.toThrow(
        BadGatewayException,
      )
      await expect(service.generateWithSearch('q')).rejects.not.toThrow(
        /rate limited/,
      )
    })

    it('passes BadGatewayException through unchanged so the disabled-client message survives', async () => {
      generateContent.mockRejectedValue(
        new BadGatewayException(
          'GEMINI_API_KEY not set; Gemini calls disabled',
        ),
      )

      await expect(service.generateWithSearch('q')).rejects.toThrow(
        /GEMINI_API_KEY not set/,
      )
    })
  })

  describe('generateStructured', () => {
    const schema = z.object({ name: z.string(), age: z.number() })

    it('parses and validates structured JSON output', async () => {
      generateContent.mockResolvedValueOnce({
        text: '{"name":"alice","age":42}',
        candidates: [{}],
      })

      const result = await service.generateStructured('q', schema)

      expect(result).toEqual({ name: 'alice', age: 42 })
      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            responseMimeType: 'application/json',
            responseJsonSchema: expect.objectContaining({
              type: 'object',
            }),
          }),
        }),
      )
    })

    it('throws BadGateway when output fails schema validation', async () => {
      generateContent.mockResolvedValueOnce({
        text: '{"name":"alice","age":"not a number"}',
        candidates: [{}],
      })

      await expect(service.generateStructured('q', schema)).rejects.toThrow(
        /failed schema validation/,
      )
    })

    it('throws BadGateway when output is not valid JSON', async () => {
      generateContent.mockResolvedValueOnce({
        text: 'not json at all',
        candidates: [{}],
      })

      await expect(service.generateStructured('q', schema)).rejects.toThrow(
        /not valid JSON/,
      )
    })

    it('throws BadGateway when Gemini returns empty text', async () => {
      generateContent.mockResolvedValueOnce({
        text: '',
        candidates: [{}],
      })

      await expect(service.generateStructured('q', schema)).rejects.toThrow(
        BadGatewayException,
      )
    })
  })

  it('uses the default model when none is provided', async () => {
    generateContent.mockResolvedValueOnce({
      text: 'ok',
      candidates: [{}],
    })

    await service.generateWithSearch('q')

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3-flash-preview' }),
    )
  })

  it('respects model and temperature overrides', async () => {
    generateContent.mockResolvedValueOnce({
      text: 'ok',
      candidates: [{}],
    })

    await service.generateWithSearch('q', {
      model: 'gemini-3-pro-preview',
      temperature: 0.1,
    })

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3-pro-preview',
        config: expect.objectContaining({ temperature: 0.1 }),
      }),
    )
  })
})
