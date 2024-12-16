import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CampaignsService } from '../campaigns.service'
import { RenameAiContentSchema } from './schemas/RenameAiContent.schema'
import { CreateAiContentSchema } from './schemas/CreateAiContent.schema'
import { ContentService } from 'src/content/content.service'
import {
  AiContentGenerationStatus,
  CampaignAiContent,
  CampaignDetailsContent,
} from '../campaigns.types'
import { UsersService } from 'src/users/users.service'
import { Campaign, Prisma } from '@prisma/client'

@Injectable()
export class CampaignsAiService {
  constructor(
    private campaignsService: CampaignsService,
    private contentService: ContentService,
    private usersService: UsersService,
  ) {}

  async createContent(userId: number, inputs: CreateAiContentSchema) {
    const { key, regenerate, editMode, chat, inputValues } = inputs

    // TODO: integrate with sqs implementation
    // await sails.helpers.queue.consumer()

    const campaign = await this.campaignsService.findByUser(userId, {
      pathToVictory: true,
      campaignPositions: true,
      campaignUpdateHistory: true,
    })
    const { slug, id } = campaign
    const aiContent = (campaign.aiContent ?? {}) as CampaignAiContent

    if (!aiContent.generationStatus) {
      aiContent.generationStatus = {}
    }

    if (
      !regenerate &&
      aiContent.generationStatus[key] !== undefined &&
      aiContent.generationStatus[key].status !== undefined &&
      aiContent.generationStatus[key].status === 'processing'
    ) {
      return {
        status: 'processing',
        step: 'waiting',
        key,
      }
    }
    const existing = aiContent[key]

    if (
      !editMode &&
      aiContent.generationStatus[key] !== undefined &&
      aiContent.generationStatus[key].status === 'completed' &&
      existing
    ) {
      return {
        status: 'completed',
        chatResponse: aiContent[key],
      }
    }

    // generating a new ai content here
    const cmsPrompts = await this.contentService.getAiContentPrompts()

    const keyNoDigits = key.replace(/\d+/g, '') // we allow multiple keys like key1, key2
    let prompt = cmsPrompts[keyNoDigits] as string
    prompt = await this.promptReplace(prompt, campaign)
    if (!prompt || prompt === '') {
      // await sails.helpers.slack.errorLoggerHelper('empty prompt replace', {
      //   cmsPrompt: cmsPrompts[keyNoDigits],
      //   promptAfterReplace: prompt,
      //   campaignObj,
      // })
      throw new NotFoundException('No prompt found')
    }
    // await sails.helpers.slack.aiLoggerHelper('prompt', {
    //   cmsPrompt: cmsPrompts[keyNoDigits],
    //   promptAfterReplace: prompt,
    // })

    if (!aiContent.generationStatus[key]) {
      aiContent.generationStatus[key] = {} as AiContentGenerationStatus
    }
    aiContent.generationStatus[key].status = 'processing'
    aiContent.generationStatus[key].prompt = prompt as string
    aiContent.generationStatus[key].existingChat = chat || []
    aiContent.generationStatus[key].inputValues = inputValues
    aiContent.generationStatus[key].createdAt = new Date().valueOf()

    // await sails.helpers.slack.slackHelper(
    //   {
    //     title: 'Debugging generationStatus',
    //     body: JSON.stringify(aiContent.generationStatus),
    //   },
    //   'dev',
    // )

    try {
      await this.campaignsService.update(campaign.id, {
        aiContent,
      })
    } catch (_e) {
      // await sails.helpers.slack.errorLoggerHelper(
      //   'Error updating generationStatus',
      //   {
      //     aiContent,
      //     key,
      //     id,
      //     success,
      //   },
      // )
      throw new BadRequestException('Error updating generationStatus')
    }

    // TODO: enqueue message using SQS queue stuff!!!
    const queueMessage = {
      type: 'generateAiContent',
      data: {
        slug,
        key,
        regenerate,
      },
    }

    // await sails.helpers.queue.enqueue(queueMessage)
    // await sails.helpers.slack.aiLoggerHelper('Enqueued AI prompt', queueMessage)

    // why do we call the consumer twice ?
    // await sails.helpers.queue.consumer()

    return {
      status: 'processing',
      step: 'created',
      key,
    }
  }

  async updateContentName(userId: number, inputs: RenameAiContentSchema) {
    const { key, name } = inputs

    const campaign = await this.campaignsService.findByUser(userId)
    const { aiContent } = campaign

    if (!aiContent?.[key]) {
      throw new BadRequestException('Invalid document key')
    }

    aiContent[key]['name'] = name

    return this.campaignsService.update(campaign.id, {
      aiContent,
    })
  }

  async deleteContent(userId: number, aiContentKey: string) {
    const campaign = await this.campaignsService.findByUser(userId)
    if (!campaign.aiContent || !campaign.aiContent[aiContentKey]) {
      // nothing to delete
      return false
    }

    delete campaign.aiContent[aiContentKey]
    delete (campaign.aiContent as CampaignAiContent).generationStatus?.[
      aiContentKey
    ]

    await this.campaignsService.update(campaign.id, {
      aiContent: campaign.aiContent,
    })

    return true
  }

  async promptReplace(
    prompt: string,
    campaign: Prisma.CampaignGetPayload<{
      include: {
        pathToVictory: true
        campaignPositions: true
        campaignUpdateHistory: true
      }
    }>,
  ) {
    try {
      let newPrompt = prompt

      const campaignPositions = campaign.campaignPositions

      const user = await this.usersService.findUser({
        id: campaign.userId as number,
      })

      // TODO: throw more specific error
      if (!user) throw new Error('NO USER BRO')

      const name = `${user.firstName} ${user.lastName}`
      const details = (campaign.details || {}) as CampaignDetailsContent

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

      const replaceArr = [
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
        } = pathToVictory.data as Record<string, any> // TODO: better type here!!
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
        } = campaign.aiContent as CampaignAiContent
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
          console.log('error at prompt replace', e)
        }
      })

      newPrompt += `\n
        
      `

      return newPrompt
    } catch (e) {
      console.log('Error in helpers/ai/promptReplace', e)
      //TODO: surface relevant error here
      return ''
    }
  }
}

function positionsToStr(campaignPositions, customIssues) {
  if (!campaignPositions && !customIssues) {
    return ''
  }
  let str = ''
  campaignPositions.forEach((campaignPosition, i) => {
    const { position, topIssue } = campaignPosition
    if (position || topIssue) {
      str += `Issue #${i + 1}: ${topIssue?.name}. Position on the issue: ${
        position?.name
      }. Candidate's position: ${campaignPosition?.description}. `
    }
  })

  if (customIssues) {
    customIssues.forEach((issue) => {
      str += `${issue?.title} - ${issue?.position}, `
    })
  }
  return str
}

function replaceAll(string, search, replace) {
  const replaceStr = replace || 'unknown'
  return string.split(`[[${search}]]`).join(replaceStr)
}

function againstToStr(runningAgainst) {
  if (!runningAgainst) {
    return ''
  }
  let str = ''
  if (runningAgainst.length > 1) {
    str = `${runningAgainst.length} candidates who are: `
  }
  runningAgainst.forEach((opponent, index) => {
    if (index > 0) {
      str += 'and also running against '
    }
    str += `name: ${opponent.name}, party: ${opponent.party} ,description: ${opponent.description}. `
  })
  return str
}
