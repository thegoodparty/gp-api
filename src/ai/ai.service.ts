import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'

import { Injectable, Logger } from '@nestjs/common'
import { Prisma, User } from '@prisma/client'
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

const { TOGETHER_AI_KEY, OPEN_AI_KEY, AI_MODELS = '' } = process.env
if (!TOGETHER_AI_KEY) {
  throw new Error('Please set TOGETHER_AI_KEY in your .env')
}
if (!OPEN_AI_KEY) {
  throw new Error('Please set OPEN_AI_KEY in your .env')
}
if (AI_MODELS === undefined || AI_MODELS === null) {
  throw new Error('Please set AI_MODELS in your .env')
}
type GetChatToolCompletionArgs = {
  messages?: AiChatMessage[]
  temperature?: number
  topP?: number
  tool?: ChatCompletionTool // list of functions that could be called.
  toolChoice?: ChatCompletionNamedToolChoice // force the function to be called on every generation if needed.
  timeout?: number // timeout request after 5 minutes
}

export type PromptReplaceCampaign = Prisma.CampaignGetPayload<{
  include: {
    pathToVictory: true
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
  private readonly logger = new Logger(AiService.name)

  constructor(private slack: SlackService) {}

  async llmChatCompletion(
    messages: AiChatMessage[],
    maxTokens: number = 500,
    temperature: number = 1.0,
    topP: number = 0.1,
  ) {
    const models = AI_MODELS.split(',')
    if (models.length === 0) {
      await this.slack.message(
        {
          body: `AI Models are not configured. Please specify AI models.`,
        },
        SlackChannel.botDev,
      )
    }

    const aiOptions = {
      maxTokens,
      temperature,
      topP,
      maxRetries: 0,
    }

    let firstModel: BaseChatModel | undefined
    let fallbackModel: BaseChatModel | undefined

    for (const model of models) {
      if (model.includes('gpt')) {
        if (!firstModel) {
          firstModel = new ChatOpenAI({
            apiKey: OPEN_AI_KEY,
            model,
            ...aiOptions,
          })
        } else {
          fallbackModel = new ChatOpenAI({
            apiKey: OPEN_AI_KEY,
            model,
            ...aiOptions,
          })
        }
      } else {
        if (!firstModel) {
          firstModel = new ChatOpenAI({
            apiKey: TOGETHER_AI_KEY,
            model,
            ...aiOptions,
            configuration: {
              baseURL: 'https://api.together.xyz/v1',
            },
          })
        } else {
          fallbackModel = new ChatOpenAI({
            apiKey: TOGETHER_AI_KEY,
            model,
            ...aiOptions,
            configuration: {
              baseURL: 'https://api.together.xyz/v1',
            },
          })
        }
      }
    }

    const modelWithFallback = firstModel!.withFallbacks([fallbackModel!])

    const sanitizedMessages = messages.map((message) => {
      let sanitizedContent = message.content
      sanitizedContent =
        sanitizedContent.replace(/\–/g, '-') || sanitizedContent
      sanitizedContent =
        sanitizedContent.replace(/\`/g, "'") || sanitizedContent

      return {
        ...message,
        ...(sanitizedContent ? { content: sanitizedContent } : {}),
      }
    })

    let completion: BaseMessage | undefined
    try {
      completion = await modelWithFallback.invoke(sanitizedMessages)
    } catch (error) {
      const err = error as Error & {
        response?: Record<string, string | number | boolean>
      }
      this.logger.error('Error in utils/ai/llmChatCompletion', err)
      this.logger.error('error response', err?.response)

      await this.slack.errorMessage({
        message: 'Error in AI completion (raw)',
        error: err,
      })
    }

    if (completion && completion?.content) {
      let content = completion.content as string
      if (content.includes('```html')) {
        content = content.match(/```html([\s\S]*?)```/)![1]
      }
      content = content.replace('/n', '<br/><br/>')

      return {
        content,
        tokens:
          (completion?.response_metadata?.tokenUsage?.totalTokens as number) ||
          0,
      }
    } else {
      return {
        content: '',
        tokens: 0,
      }
    }
  }

  async getChatToolCompletion({
    messages = [],
    temperature = 0.1,
    topP = 0.1,
    tool = undefined, // list of functions that could be called.
    timeout = 300000, // timeout request after 5 minutes
  }: GetChatToolCompletionArgs) {
    const models = AI_MODELS.split(',')
    for (const model of models) {
      // Lama 3.3 supports native function calling
      // so we can modify the OpenAI base url to use the together.ai api
      this.logger.debug('model', model)
      const togetherAi = model.includes('meta-llama') || model.includes('Qwen')
      const client = new OpenAI({
        apiKey: togetherAi ? TOGETHER_AI_KEY : OPEN_AI_KEY,
        baseURL: togetherAi ? 'https://api.together.xyz/v1' : undefined,
      })

      let completion: ChatCompletion
      try {
        if (tool) {
          completion = await client.chat.completions.create(
            {
              model,
              messages,
              top_p: topP,
              temperature: temperature,
              tools: [tool],
            },
            {
              timeout,
            },
          )
        } else {
          completion = await client.chat.completions.create(
            {
              model,
              messages,
              top_p: topP,
              temperature: temperature,
            },
            {
              timeout,
            },
          )
        }

        let content = ''
        if (completion?.choices && completion.choices[0]?.message) {
          if (completion.choices[0].message?.tool_calls) {
            // console.log('completion (json)', JSON.stringify(completion, null, 2));
            const toolCalls = completion.choices[0].message.tool_calls
            if (toolCalls && toolCalls.length > 0) {
              content = toolCalls[0]?.function?.arguments || ''
            }
            if (content === '') {
              // we are expecting tool_calls to have a function call response
              // but we can check if the model returned a response without a function call
              content = completion.choices[0].message?.content || ''
            }
          } else {
            // console.log('completion (raw)', completion);
            content = completion.choices[0].message?.content || ''
          }
        }
        content = content.trim()

        if (content && content !== '') {
          if (content.includes('<function=')) {
            // there is some bug either with openai client, llama3.1 native FC, or together.ai api
            // where the tool_calls are not being returned in the response
            // so we can parse the function call from the content
            const toolResponse = this.parseToolResponse(content)
            if (toolResponse) {
              content = toolResponse.arguments
            }
          }
        }

        if (content.includes('```html')) {
          const match = content.match(/```html([\s\S]*?)```/)
          content = match?.length ? match[1] : content
        }
        content = content.replace('/n', '<br/><br/>')
        this.logger.debug('completion success', content)
        return {
          content,
          tokens: completion?.usage?.total_tokens || 0,
        }
      } catch (error) {
        this.logger.error('error', error)
        await this.slack.formattedMessage({
          message: `Error in getChatToolCompletion. model: ${model}`,
          error,
          channel: SlackChannel.botDev,
        })
      }
    }

    return {
      content: '',
      tokens: 0,
    }
  }

  private parseToolResponse(response: string):
    | {
        function: string
        arguments: string
      }
    | undefined {
    const functionRegex = /<function=(\w+)>(.*?)<\/function>/
    const match = response.match(functionRegex)

    if (match) {
      const [functionName, argsString] = match
      try {
        const args = JSON.parse(argsString) as string
        return {
          function: functionName,
          arguments: args,
        }
      } catch (error) {
        this.logger.error(`Error parsing function arguments: ${error}`)
        return undefined
      }
    }
    return undefined
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
    try {
      if (!assistantId || !systemPrompt) {
        this.logger.log('missing assistantId or systemPrompt')
        this.logger.log('assistantId', assistantId)
        this.logger.log('systemPrompt', systemPrompt)
        return
      }

      if (!threadId) {
        this.logger.log('missing threadId')
        return
      }

      this.logger.log(`running assistant ${assistantId} on thread ${threadId}`)

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
        this.logger.log('deleting message', messageId)
        messages = messages.filter((m) => m.id !== messageId)
      } else {
        messages.push({
          content: message.content,
          role: 'user',
          createdAt: new Date().valueOf(),
          id: crypto.randomUUID(),
        })
      }

      this.logger.log('messages', messages)

      const result = await this.llmChatCompletion(
        messages,
        500,
        temperature,
        topP,
      )

      return {
        content: result?.content,
        threadId,
        id: crypto.randomUUID(),
        role: 'assistant',
        createdAt: new Date().valueOf(),
        usage: result?.tokens,
      }
    } catch (error) {
      this.logger.log('error', error)
      await this.slack.message(
        {
          body: `Error in getAssistantCompletion. Error: ${error}`,
        },
        SlackChannel.botDev,
      )
    }
    return
  }
  /** function to replace placeholder tokens in ai content prompt */
  async promptReplace(prompt: string, campaign: PromptReplaceCampaign) {
    try {
      let newPrompt = prompt

      const campaignPositions = campaign.campaignPositions
      const user = campaign.user as User

      const name = getUserFullName(user)
      const details = campaign.details

      const positionsStr = positionsToStr(
        campaignPositions,
        details.customIssues,
      )
      let party =
        details.party === 'Other' ? details.otherParty : details?.party
      if (party === 'Independent') {
        party = 'Independent / non-partisan'
      }
      const office =
        details.office === 'Other' ? details.otherOffice : details?.office

      const replaceArr: {
        find: string
        replace: string | boolean | number | undefined | null
      }[] = [
        {
          find: 'name',
          replace: name,
        },
        {
          find: 'zip',
          replace: details.zip,
        },
        {
          find: 'website',
          replace: details.website,
        },
        {
          find: 'party',
          replace: party,
        },
        {
          find: 'state',
          replace: details.state,
        },
        {
          find: 'primaryElectionDate',
          replace: details.primaryElectionDate,
        },
        {
          find: 'district',
          replace: details.district,
        },
        {
          find: 'office',
          replace: `${office}${
            details.district ? ` in ${details.district}` : ''
          }`,
        },
        {
          find: 'positions',
          replace: positionsStr,
        },
        {
          find: 'pastExperience',
          replace:
            typeof details.pastExperience === 'string'
              ? details.pastExperience
              : JSON.stringify(details.pastExperience || {}),
        },
        {
          find: 'occupation',
          replace: details.occupation,
        },
        {
          find: 'funFact',
          replace: details.funFact,
        },
        {
          find: 'campaignCommittee',
          replace: details.campaignCommittee || 'unknown',
        },
      ]
      const againstStr = againstToStr(details.runningAgainst)
      replaceArr.push(
        {
          find: 'runningAgainst',
          replace: againstStr,
        },
        {
          find: 'electionDate',
          replace: details.electionDate,
        },
        {
          find: 'statementName',
          replace: details.statementName,
        },
      )

      const pathToVictory = campaign.pathToVictory

      if (pathToVictory) {
        const {
          projectedTurnout,
          winNumber,
          republicans,
          democrats,
          indies,
          averageTurnout,
          allAvailVoters,
          availVotersTo35,
          women,
          men,
          africanAmerican,
          white,
          asian,
          hispanic,
          voteGoal,
          voterProjection,
          totalRegisteredVoters,
          budgetLow,
          budgetHigh,
        } = pathToVictory.data as Record<string, string | number> // TODO: better type here!!
        replaceArr.push(
          {
            find: 'pathToVictory',
            replace: JSON.stringify(pathToVictory.data),
          },
          {
            find: 'projectedTurnout',
            replace: projectedTurnout,
          },
          {
            find: 'totalRegisteredVoters',
            replace: totalRegisteredVoters,
          },
          {
            find: 'winNumber',
            replace: winNumber,
          },
          {
            find: 'republicans',
            replace: republicans,
          },
          {
            find: 'democrats',
            replace: democrats,
          },
          {
            find: 'indies',
            replace: indies,
          },
          {
            find: 'averageTurnout',
            replace: averageTurnout,
          },
          {
            find: 'allAvailVoters',
            replace: allAvailVoters,
          },
          {
            find: 'availVotersTo35',
            replace: availVotersTo35,
          },
          {
            find: 'women',
            replace: women,
          },
          {
            find: 'men',
            replace: men,
          },
          {
            find: 'africanAmerican',
            replace: africanAmerican,
          },
          {
            find: 'white',
            replace: white,
          },
          {
            find: 'asian',
            replace: asian,
          },
          {
            find: 'hispanic',
            replace: hispanic,
          },
          {
            find: 'voteGoal',
            replace: voteGoal,
          },
          {
            find: 'voterProjection',
            replace: voterProjection,
          },
          {
            find: 'budgetLow',
            replace: budgetLow,
          },
          {
            find: 'budgetHigh',
            replace: budgetHigh,
          },
        )
      }

      if (newPrompt.includes('[[updateHistory]]')) {
        const updateHistoryObjects = campaign.campaignUpdateHistory

        const twoWeeksAgo = new Date()
        const thisWeek = new Date()
        thisWeek.setDate(thisWeek.getDate() - 7)
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

        const updateHistory = {
          allTime: {
            total: 0,
            doorKnocking: 0,
            digitalAds: 0,
            calls: 0,
            yardSigns: 0,
            events: 0,
            text: 0,
            directMail: 0,
          },
          thisWeek: {
            total: 0,
            doorKnocking: 0,
            digitalAds: 0,
            calls: 0,
            yardSigns: 0,
            events: 0,
            text: 0,
            directMail: 0,
          },
          lastWeek: {
            total: 0,
            doorKnocking: 0,
            digitalAds: 0,
            calls: 0,
            yardSigns: 0,
            events: 0,
            text: 0,
            directMail: 0,
          },
        }

        if (updateHistoryObjects) {
          for (const update of updateHistoryObjects) {
            updateHistory.allTime[update.type] += update.quantity
            updateHistory.allTime.total += update.quantity
            if (update.createdAt > thisWeek) {
              updateHistory.thisWeek[update.type] += update.quantity
              updateHistory.thisWeek.total += update.quantity
            }
            if (update.createdAt > twoWeeksAgo && update.createdAt < thisWeek) {
              updateHistory.lastWeek[update.type] += update.quantity
              updateHistory.lastWeek.total += update.quantity
            }
          }
        }
        replaceArr.push({
          find: 'updateHistory',
          replace: JSON.stringify(updateHistory),
        })
      }

      if (campaign.aiContent) {
        const {
          aboutMe,
          communicationStrategy,
          messageBox,
          mobilizing,
          policyPlatform,
          slogan,
          why,
        } = campaign.aiContent
        replaceArr.push(
          {
            find: 'slogan',
            replace: slogan?.content,
          },
          {
            find: 'why',
            replace: why?.content,
          },
          {
            find: 'about',
            replace: aboutMe?.content,
          },
          {
            find: 'myPolicies',
            replace: policyPlatform?.content,
          },
          {
            find: 'commStart',
            replace: communicationStrategy?.content,
          },
          {
            find: 'mobilizing',
            replace: mobilizing?.content,
          },
          {
            find: 'positioning',
            replace: messageBox?.content,
          },
        )
      }

      replaceArr.forEach((item) => {
        try {
          newPrompt = replaceAll(
            newPrompt,
            item.find,
            item.replace ? item.replace.toString().trim() : '',
          )
        } catch (e) {
          this.logger.error('error at prompt replace', e)
        }
      })

      newPrompt += `\n

      `

      return newPrompt
    } catch (e) {
      this.logger.error('Error in helpers/ai/promptReplace', e)
      return ''
    }
  }
}
