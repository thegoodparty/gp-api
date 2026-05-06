import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'

import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { OpenAI } from 'openai'
import {
  ChatCompletion,
  ChatCompletionNamedToolChoice,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import { getUserFullName } from 'src/users/util/users.util'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { AiChatMessage } from '../campaigns/ai/chat/aiChat.types'
import { SlackChannel } from '../vendors/slack/slackService.types'
import { againstToStr, positionsToStr, replaceAll } from './util/aiContent.util'
import { PinoLogger } from 'nestjs-pino'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { RaceTargetMetrics } from '@/elections/types/elections.types'

const { TOGETHER_AI_KEY, OPEN_AI_KEY, AI_MODELS = '' } = process.env
if (!TOGETHER_AI_KEY) {
  throw new Error('Please set TOGETHER_AI_KEY in your .env')
}
if (!OPEN_AI_KEY) {
  throw new Error('Please set OPEN_AI_KEY in your .env')
}

const TOGETHER_AI_BASE_URL = 'https://api.together.xyz/v1'

const PARSED_AI_MODELS = AI_MODELS.split(',')
  .map((m) => m.trim())
  .filter((m) => m.length > 0)

type PromptReplacement = {
  find: string
  replace: string | boolean | number | undefined | null
}

type GetChatToolCompletionArgs = {
  messages?: AiChatMessage[]
  temperature?: number
  topP?: number
  tool?: ChatCompletionTool // list of functions that could be called.
  toolChoice?: ChatCompletionNamedToolChoice // force the function to be called on every generation if needed.
  timeout?: number // timeout request after 5 minutes
  models?: string[] // override PARSED_AI_MODELS for this call (tried in order)
}

export type PromptReplaceCampaign = Prisma.CampaignGetPayload<{
  include: {
    campaignPositions: {
      include: {
        topIssue: true
        position: true
      }
    }
    campaignUpdateHistory: true
    user: true
  }
}>

type GetAssistantCompletionArgs = {
  systemPrompt: string
  candidateContext: string
  assistantId: string
  threadId: string
  message: AiChatMessage
  messageId: string
  existingMessages?: AiChatMessage[]
  temperature?: number
  topP?: number
}

/**
 * @deprecated This service is deprecated. Use `LlmService` from `src/llm/services/llm.service` instead.
 */
@Injectable()
export class AiService {
  constructor(
    private slack: SlackService,
    @Inject(forwardRef(() => OrganizationsService))
    private readonly organizations: OrganizationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AiService.name)
  }

  private buildChatModel(
    modelName: string,
    options: { maxTokens: number; temperature: number; topP: number },
  ): BaseChatModel {
    const isOpenAi = modelName.includes('gpt')
    return new ChatOpenAI({
      apiKey: isOpenAi ? OPEN_AI_KEY : TOGETHER_AI_KEY,
      model: modelName,
      ...options,
      maxRetries: 0,
      timeout: 120_000,
      ...(!isOpenAi && {
        configuration: { baseURL: TOGETHER_AI_BASE_URL },
        modelKwargs: { reasoning: { enabled: false } },
      }),
    })
  }

  private extractContent(raw: BaseMessage['content']): string {
    if (typeof raw === 'string') return raw
    if (Array.isArray(raw)) {
      return raw
        .map((part: { type?: string; text?: string }) =>
          part.type === 'text' && typeof part.text === 'string'
            ? part.text
            : '',
        )
        .join('')
    }
    return String(raw)
  }

  private extractTokenCount(completion: BaseMessage): number {
    const tokenUsage: unknown = completion.response_metadata?.tokenUsage
    if (
      tokenUsage &&
      typeof tokenUsage === 'object' &&
      'totalTokens' in tokenUsage &&
      typeof tokenUsage.totalTokens === 'number'
    ) {
      return tokenUsage.totalTokens
    }
    return 0
  }

  private static stripHtmlFences(content: string): string {
    if (!content.includes('```html')) return content
    const match = content.match(/```html([\s\S]*?)```/)
    return match ? match[1] : content
  }

  private static sanitizeMessage(message: AiChatMessage): AiChatMessage {
    const content = message.content.replace(/\u2013/g, '-').replace(/`/g, "'")
    return { ...message, content }
  }

  async llmChatCompletion(
    messages: AiChatMessage[],
    maxTokens: number = 500,
    temperature: number = 1.0,
    topP: number = 0.1,
  ) {
    if (PARSED_AI_MODELS.length === 0) {
      throw new Error(
        'AI_MODELS env var is empty — no models configured for AI completion',
      )
    }

    const options = { maxTokens, temperature, topP }
    const sanitizedMessages = messages.map(AiService.sanitizeMessage)

    for (const modelName of PARSED_AI_MODELS) {
      const model = this.buildChatModel(modelName, options)

      try {
        const completion = await model.invoke(sanitizedMessages)
        const raw = this.extractContent(completion.content)

        if (!raw) {
          this.logger.warn(
            { model: modelName },
            'Model returned empty content, trying next',
          )
          continue
        }

        let content = AiService.stripHtmlFences(raw)
        content = content.replace(/\n/g, '<br/><br/>')

        return {
          content,
          tokens: this.extractTokenCount(completion),
        }
      } catch (error) {
        this.logger.error(
          { err: error, model: modelName },
          'Error in llmChatCompletion',
        )
        try {
          await this.slack.errorMessage({
            message: `Error in AI completion (${modelName})`,
            error,
          })
        } catch {
          // Slack notification must never prevent model fallback
        }
      }
    }

    throw new Error('All AI models failed or returned empty content')
  }

  private buildOpenAiClient(model: string): OpenAI {
    const isOpenAi = model.includes('gpt')
    return new OpenAI({
      apiKey: isOpenAi ? OPEN_AI_KEY : TOGETHER_AI_KEY,
      baseURL: isOpenAi ? undefined : TOGETHER_AI_BASE_URL,
    })
  }

  private extractToolContent(
    message: ChatCompletion.Choice['message'],
  ): string {
    const toolCalls = message.tool_calls
    if (toolCalls?.length) {
      const args = toolCalls[0]?.function?.arguments
      if (args) return args
    }
    return message.content || ''
  }

  async getChatToolCompletion({
    messages = [],
    temperature = 0.1,
    topP = 0.1,
    tool,
    toolChoice,
    timeout = 300000,
    models,
  }: GetChatToolCompletionArgs) {
    const modelsToTry = models?.length ? models : PARSED_AI_MODELS
    for (const model of modelsToTry) {
      this.logger.debug({ model }, 'model')
      const client = this.buildOpenAiClient(model)

      const isTogetherAi = !model.includes('gpt')
      try {
        const completion = await client.chat.completions.create(
          {
            model,
            messages,
            top_p: topP,
            temperature,
            ...(tool && { tools: [tool] }),
            ...(toolChoice && { tool_choice: toolChoice }),
            ...(isTogetherAi && { reasoning: { enabled: false } }),
          },
          { timeout },
        )

        const message = completion.choices[0]?.message
        let content = message ? this.extractToolContent(message) : ''
        content = content.trim()
        content = this.applyToolResponseFallback(content)

        content = AiService.stripHtmlFences(content)
        content = content.replace(/\n/g, '<br/><br/>')

        this.logger.debug({ content }, 'completion success')
        return {
          content,
          tokens: completion.usage?.total_tokens ?? 0,
        }
      } catch (error) {
        this.logger.error(
          { err: error, model },
          'Error in getChatToolCompletion',
        )
        try {
          await this.slack.formattedMessage({
            message: `Error in getChatToolCompletion. model: ${model}`,
            error,
            channel: SlackChannel.botDev,
          })
        } catch {
          // Slack notification must never prevent model fallback
        }
      }
    }

    return { content: '', tokens: 0 }
  }

  private applyToolResponseFallback(content: string): string {
    if (!content.includes('<function=')) return content
    const toolResponse = this.parseToolResponse(content)
    return toolResponse ? toolResponse.arguments : content
  }

  private parseToolResponse(
    response: string,
  ): { function: string; arguments: string } | undefined {
    const match = response.match(/<function=(\w+)>(.*?)<\/function>/)
    if (!match) return undefined

    const [, functionName, argsString] = match
    try {
      JSON.parse(argsString) // validate JSON
      return { function: functionName, arguments: argsString }
    } catch (error) {
      this.logger.error(`Error parsing function arguments: ${error}`)
      return undefined
    }
  }

  async getAssistantCompletion({
    systemPrompt,
    candidateContext,
    assistantId,
    threadId,
    message,
    messageId,
    existingMessages,
    temperature = 0.7,
    topP = 0.1,
  }: GetAssistantCompletionArgs) {
    if (!assistantId || !systemPrompt) {
      throw new Error(
        `Missing required params: assistantId=${assistantId}, systemPrompt=${!!systemPrompt}`,
      )
    }

    if (!threadId) {
      throw new Error('Missing threadId for assistant completion')
    }

    this.logger.info(`running assistant ${assistantId} on thread ${threadId}`)

    let messages: AiChatMessage[] = []
    messages.push({
      content: systemPrompt + '\n' + candidateContext,
      role: 'system',
      createdAt: new Date().valueOf(),
      id: crypto.randomUUID(),
    })

    if (existingMessages) {
      messages.push(...existingMessages)
    }

    if (messageId) {
      this.logger.info(
        { messageId },
        'filtering out old message for regeneration',
      )
      messages = messages.filter((m) => m.id !== messageId)
    }

    messages.push({
      content: message.content,
      role: 'user',
      createdAt: new Date().valueOf(),
      id: crypto.randomUUID(),
    })

    this.logger.info({ messages }, 'messages')

    const result = await this.llmChatCompletion(
      messages,
      500,
      temperature,
      topP,
    )

    return {
      content: result.content,
      threadId,
      id: crypto.randomUUID(),
      role: 'assistant',
      createdAt: new Date().valueOf(),
      usage: result.tokens,
    }
  }
  /** Replace placeholder tokens in AI content prompt */
  async promptReplace(
    prompt: string,
    campaign: PromptReplaceCampaign,
    liveMetrics?: RaceTargetMetrics | null,
  ) {
    try {
      if (!campaign.user) {
        throw new Error('Campaign has no associated user')
      }

      const replacements: PromptReplacement[] = [
        ...this.buildCampaignReplacements(campaign),
        ...(await this.buildOfficeReplacement(campaign)),
        ...this.buildLiveMetricsReplacements(liveMetrics),
        ...this.buildUpdateHistoryReplacement(prompt, campaign),
        ...this.buildAiContentReplacements(campaign),
      ]

      let result = prompt
      for (const { find, replace } of replacements) {
        try {
          result = replaceAll(
            result,
            find,
            replace ? replace.toString().trim() : '',
          )
        } catch (e) {
          this.logger.error({ e }, 'error at prompt replace')
        }
      }

      return result + '\n\n      '
    } catch (e) {
      this.logger.error({ e }, 'Error in helpers/ai/promptReplace')
      return ''
    }
  }

  private buildCampaignReplacements(
    campaign: PromptReplaceCampaign,
  ): PromptReplacement[] {
    const user = campaign.user!
    const details = campaign.details
    const name = getUserFullName(user)
    const positionsStr = positionsToStr(
      campaign.campaignPositions,
      details.customIssues,
    )

    let party = details.party === 'Other' ? details.otherParty : details?.party
    if (party === 'Independent') {
      party = 'Independent / non-partisan'
    }

    return [
      { find: 'name', replace: name },
      { find: 'zip', replace: details.zip },
      { find: 'website', replace: details.website },
      { find: 'party', replace: party },
      { find: 'state', replace: details.state },
      { find: 'primaryElectionDate', replace: details.primaryElectionDate },
      { find: 'district', replace: details.district },
      { find: 'positions', replace: positionsStr },
      {
        find: 'pastExperience',
        replace:
          typeof details.pastExperience === 'string'
            ? details.pastExperience
            : JSON.stringify(details.pastExperience || {}),
      },
      { find: 'occupation', replace: details.occupation },
      { find: 'funFact', replace: details.funFact },
      {
        find: 'campaignCommittee',
        replace: details.campaignCommittee || 'unknown',
      },
      {
        find: 'runningAgainst',
        replace: againstToStr(details.runningAgainst),
      },
      { find: 'electionDate', replace: details.electionDate },
      { find: 'statementName', replace: details.statementName },
    ]
  }

  private async buildOfficeReplacement(
    campaign: PromptReplaceCampaign,
  ): Promise<PromptReplacement[]> {
    const positionName = campaign.organizationSlug
      ? await this.organizations.resolvePositionNameByOrganizationSlug(
          campaign.organizationSlug,
        )
      : null

    const office =
      positionName && campaign.details.district
        ? `${positionName} in ${campaign.details.district}`
        : positionName || ''

    return [{ find: 'office', replace: office }]
  }

  private buildLiveMetricsReplacements(
    liveMetrics?: RaceTargetMetrics | null,
  ): PromptReplacement[] {
    if (!liveMetrics) return []

    return [
      { find: 'projectedTurnout', replace: liveMetrics.projectedTurnout },
      { find: 'winNumber', replace: liveMetrics.winNumber },
      { find: 'voteGoal', replace: liveMetrics.voterContactGoal },
      { find: 'voterContactGoal', replace: liveMetrics.voterContactGoal },
    ]
  }

  private buildUpdateHistoryReplacement(
    prompt: string,
    campaign: PromptReplaceCampaign,
  ): PromptReplacement[] {
    if (!prompt.includes('[[updateHistory]]')) return []

    const updates = campaign.campaignUpdateHistory
    const thisWeek = new Date()
    const twoWeeksAgo = new Date()
    thisWeek.setDate(thisWeek.getDate() - 7)
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

    const emptyBucket = () => ({
      total: 0,
      doorKnocking: 0,
      digitalAds: 0,
      calls: 0,
      yardSigns: 0,
      events: 0,
      text: 0,
      directMail: 0,
    })

    const history = {
      allTime: emptyBucket(),
      thisWeek: emptyBucket(),
      lastWeek: emptyBucket(),
    }

    if (updates) {
      for (const u of updates) {
        history.allTime[u.type] += u.quantity
        history.allTime.total += u.quantity

        if (u.createdAt > thisWeek) {
          history.thisWeek[u.type] += u.quantity
          history.thisWeek.total += u.quantity
        } else if (u.createdAt > twoWeeksAgo) {
          history.lastWeek[u.type] += u.quantity
          history.lastWeek.total += u.quantity
        }
      }
    }

    return [{ find: 'updateHistory', replace: JSON.stringify(history) }]
  }

  private buildAiContentReplacements(
    campaign: PromptReplaceCampaign,
  ): PromptReplacement[] {
    if (!campaign.aiContent) return []

    const {
      aboutMe,
      communicationStrategy,
      messageBox,
      mobilizing,
      policyPlatform,
      slogan,
      why,
    } = campaign.aiContent

    return [
      { find: 'slogan', replace: slogan?.content },
      { find: 'why', replace: why?.content },
      { find: 'about', replace: aboutMe?.content },
      { find: 'myPolicies', replace: policyPlatform?.content },
      { find: 'commStart', replace: communicationStrategy?.content },
      { find: 'mobilizing', replace: mobilizing?.content },
      { find: 'positioning', replace: messageBox?.content },
    ]
  }
}
