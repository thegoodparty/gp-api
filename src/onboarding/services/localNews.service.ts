import { BadGatewayException, Injectable } from '@nestjs/common'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { PinoLogger } from 'nestjs-pino'
import crypto from 'node:crypto'
import { AiService } from '@/ai/ai.service'
import type { AiChatMessage } from '@/campaigns/ai/chat/aiChat.types'
import {
  LocalNewsResponse,
  localNewsResponseSchema,
} from '../schemas/getLocalNews.schema'

const SYSTEM_PROMPT = `You are a local media research assistant helping political candidates identify news outlets to monitor during their campaign.

Given a candidate's race location, return exactly 3 local news outlets that the candidate should monitor for coverage of local issues and their race.

REQUIREMENTS:
1. Each outlet must primarily serve the local jurisdiction specified. Do NOT include national outlets (NYT, CNN, Fox, NPR national, AP, Reuters, etc.) or outlets whose coverage area is significantly broader than the race jurisdiction.
2. Prioritize outlets known for straight news reporting over opinion or advocacy outlets. Avoid outlets with a clear partisan lean (left or right).
3. Include a mix of formats when possible (TV, print, radio), but prioritize relevance over format diversity.
4. Prefer outlets that actively cover local government, elections, and civic affairs.

If you cannot identify 3 qualifying local outlets for the jurisdiction, return as many as you can (minimum 1) and do not fabricate outlets.`

const tool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'returnLocalNewsOutlets',
    description:
      'Return the list of local news outlets a candidate should monitor.',
    parameters: {
      type: 'object',
      properties: {
        outlets: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: {
            type: 'object',
            required: ['name', 'type', 'description'],
            properties: {
              name: {
                type: 'string',
                description: "The outlet's commonly known name.",
              },
              type: {
                type: 'string',
                enum: ['TV', 'print', 'radio'],
              },
              description: {
                type: 'string',
                description:
                  "1 to 2 sentences covering the outlet's coverage area, focus, and why it's relevant for a candidate to monitor.",
              },
            },
          },
        },
      },
      required: ['outlets'],
    },
  },
}

@Injectable()
export class OnboardingLocalNewsService {
  constructor(
    private readonly ai: AiService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OnboardingLocalNewsService.name)
  }

  async getLocalNews({
    city,
    state,
    office,
  }: {
    city?: string
    state: string
    office: string
  }): Promise<LocalNewsResponse> {
    const jurisdiction = city ? `${city}, ${state}` : state
    const messages: AiChatMessage[] = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      },
      {
        role: 'user',
        content: `Jurisdiction: ${jurisdiction}\nOffice: ${office}`,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      },
    ]

    const completion = await this.ai.getChatToolCompletion({
      messages,
      tool,
      toolChoice: {
        type: 'function',
        function: { name: 'returnLocalNewsOutlets' },
      },
      temperature: 0.2,
      topP: 0.1,
      models: ['deepseek-ai/DeepSeek-V4-Pro'],
    })

    const raw = completion.content?.trim()
    if (!raw) {
      throw new BadGatewayException(
        'AI service returned no content for local news outlets',
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      this.logger.error(
        { error, raw },
        'Failed to JSON.parse local news AI response',
      )
      throw new BadGatewayException('AI service returned invalid JSON')
    }

    const validated = localNewsResponseSchema.safeParse(parsed)
    if (!validated.success) {
      this.logger.error(
        { issues: validated.error.issues, parsed },
        'AI local news response failed schema validation',
      )
      throw new BadGatewayException('AI service returned an unexpected shape')
    }

    return validated.data
  }
}
