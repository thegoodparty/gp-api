import {
  BadGatewayException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common'
import { GoogleGenAI, type GenerateContentParameters } from '@google/genai'
import { PinoLogger } from 'nestjs-pino'
import { z, ZodError } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  GEMINI_MODEL,
  GenerateOptions,
  GeminiModel,
  GroundingSource,
  SearchResult,
} from '../gemini.types'

const DEFAULT_TEMPERATURE = 0.7

export const GEMINI_CLIENT_TOKEN = 'GEMINI_CLIENT_TOKEN'

// Narrow port over @google/genai — declares only the fields this service
// reads so the test mock doesn't have to satisfy the SDK's class shape.
export interface GeminiGroundingChunk {
  web?: { title?: string; uri?: string }
}

export interface GeminiCandidate {
  groundingMetadata?: {
    webSearchQueries?: string[]
    groundingChunks?: GeminiGroundingChunk[]
  }
}

export interface GeminiResponse {
  text?: string
  candidates?: GeminiCandidate[]
}

export interface GeminiClient {
  models: {
    generateContent: (
      params: GenerateContentParameters,
    ) => Promise<GeminiResponse>
  }
}

const buildDisabledClient = (): GeminiClient => ({
  models: {
    generateContent: () =>
      Promise.reject(
        new BadGatewayException(
          'GEMINI_API_KEY not set; Gemini calls disabled',
        ),
      ),
  },
})

@Injectable()
export class GeminiService {
  private readonly client: GeminiClient
  private readonly defaultModel: GeminiModel = GEMINI_MODEL.FLASH_3_PREVIEW

  constructor(
    private readonly logger: PinoLogger,
    @Optional() @Inject(GEMINI_CLIENT_TOKEN) client?: GeminiClient,
  ) {
    this.logger.setContext(GeminiService.name)
    if (client) {
      this.client = client
      return
    }
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY not set - Gemini calls will fail at runtime',
      )
      this.client = buildDisabledClient()
      return
    }
    this.client = new GoogleGenAI({ apiKey })
  }

  async generateWithSearch(
    prompt: string,
    options?: GenerateOptions,
  ): Promise<SearchResult> {
    const response = await this.callGemini(prompt, options, {
      tools: [{ googleSearch: {} }],
    })

    const text = response.text
    if (!text) {
      throw new BadGatewayException('Gemini returned empty text')
    }

    return {
      text,
      searchQueries: this.extractSearchQueries(response),
      sources: this.extractSources(response),
    }
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: GenerateOptions,
  ): Promise<T> {
    const jsonSchema = zodToJsonSchema(schema, { target: 'openApi3' })

    const response = await this.callGemini(prompt, options, {
      responseJsonSchema: jsonSchema,
      responseMimeType: 'application/json',
    })

    const text = response.text
    if (!text) {
      throw new BadGatewayException('Gemini returned empty text')
    }

    try {
      return schema.parse(JSON.parse(text))
    } catch (error) {
      if (error instanceof ZodError) {
        this.logger.error(
          { err: error, text },
          'Gemini output failed schema validation',
        )
        throw new BadGatewayException('Gemini output failed schema validation')
      }
      this.logger.error(
        { err: error, text },
        'Gemini output was not valid JSON',
      )
      throw new BadGatewayException('Gemini output was not valid JSON')
    }
  }

  private async callGemini(
    prompt: string,
    options: GenerateOptions | undefined,
    configOverrides: GenerateContentParameters['config'],
  ): Promise<GeminiResponse> {
    const model = options?.model ?? this.defaultModel
    const temperature = options?.temperature ?? DEFAULT_TEMPERATURE

    const config: GenerateContentParameters['config'] = {
      temperature,
      ...(options?.systemInstruction && {
        systemInstruction: options.systemInstruction,
      }),
      ...configOverrides,
    }

    try {
      return await this.client.models.generateContent({
        model,
        contents: prompt,
        config,
      })
    } catch (error) {
      this.logger.error({ err: error, model }, 'Gemini API call failed')
      throw new BadGatewayException('LLM provider error')
    }
  }

  private extractSearchQueries(response: GeminiResponse): string[] {
    const metadata = response.candidates?.[0]?.groundingMetadata
    return metadata?.webSearchQueries ?? []
  }

  private extractSources(response: GeminiResponse): GroundingSource[] {
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks
    if (!chunks) return []

    return chunks
      .map((chunk): GroundingSource | null => {
        const web = chunk.web
        if (!web?.title || !web.uri) return null
        return { title: web.title, uri: web.uri }
      })
      .filter((source): source is GroundingSource => source !== null)
  }
}
