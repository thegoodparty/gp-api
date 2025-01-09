import { ChatOpenAI } from '@langchain/openai'
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai'
import { Injectable, Logger } from '@nestjs/common'
import { SlackService } from 'src/shared/services/slack.service'
import { Prisma, User } from '@prisma/client'
import { getFullName } from 'src/users/util/users.util'
import { againstToStr, positionsToStr, replaceAll } from './util/aiContent.util'
import { AiChatMessage } from 'src/campaigns/ai/chat/aiChat.types'

const TOGETHER_AI_KEY = process.env.TOGETHER_AI_KEY
const OPEN_AI_KEY = process.env.OPEN_AI_KEY
const AI_MODELS = process.env.AI_MODELS || ''

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
          title: 'Error',
          body: `AI Models are not configured. Please specify AI models.`,
        },
        'dev',
      )
    }

    const aiOptions = {
      maxTokens,
      temperature,
      topP,
      maxRetries: 0,
    }

    let firstModel
    let fallbackModel

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
          firstModel = new ChatTogetherAI({
            apiKey: TOGETHER_AI_KEY,
            model,
            ...aiOptions,
          })
        } else {
          fallbackModel = new ChatTogetherAI({
            apiKey: TOGETHER_AI_KEY,
            model,
            ...aiOptions,
          })
        }
      }
    }

    const modelWithFallback = firstModel.withFallbacks([fallbackModel])

    for (let i = 0; i < messages.length; i++) {
      if (messages[i].content !== undefined && messages[i].content.length > 0) {
        // replace invalid characters
        messages[i].content = messages[i].content.replace(/\–/g, '-')
        messages[i].content = messages[i].content.replace(/\`/g, "'")
      }
    }

    let completion
    try {
      completion = await modelWithFallback.invoke(messages)
    } catch (error: any) {
      this.logger.error('Error in utils/ai/llmChatCompletion', error)
      this.logger.error('error response', error?.response)

      await this.slack.errorMessage('Error in AI completion (raw)', error)
    }

    if (completion && completion?.content) {
      let content = completion.content
      if (content.includes('```html')) {
        content = content.match(/```html([\s\S]*?)```/)[1]
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
          title: 'Error in AI',
          body: `Error in getAssistantCompletion. Error: ${error}`,
        },
        'dev',
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

      const name = getFullName(user)
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
