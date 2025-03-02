import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { SlackService } from '../../shared/services/slack.service'
import { EnqueueService } from '../../queue/producer/enqueue.service'
import { SlackChannel } from '../../shared/services/slackService.types'
import { Campaign, User } from '@prisma/client'
import { RacesService } from '../../elections/services/races.service'
import { PathToVictoryQueueMessage } from '../types/pathToVictory.types'

@Injectable()
export class EnqueuePathToVictoryService {
  private readonly logger = new Logger(EnqueuePathToVictoryService.name)

  constructor(
    private prisma: PrismaService,
    private slackService: SlackService,
    private queueService: EnqueueService,
    private racesService: RacesService,
  ) {}

  async enqueuePathToVictory(campaignId: number) {
    try {
      if (!campaignId) {
        throw new Error('campaignId is required')
      }

      // Get fresh copy of campaign
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { pathToVictory: true },
      })

      if (!campaign) {
        await this.slackService.message(
          {
            body: `Enqueue-path-to-victory received invalid campaignId ${campaignId}`,
          },
          SlackChannel.botPathToVictoryIssues,
        )
        throw new Error('campaign not found')
      }

      const slug = campaign.slug
      const details = campaign.details as PrismaJson.CampaignDetails
      let queueMessage: PathToVictoryQueueMessage | undefined

      if (details?.raceId) {
        this.logger.debug(
          `getting race details campaignId ${campaignId} raceId ${details.raceId} zip ${details.zip}`,
        )

        const raceData = await this.racesService.getRaceDetails(
          details.raceId,
          slug,
          details.zip,
        )

        if (!raceData) {
          await this.slackService.message(
            { body: `Failed to get race data for ${slug}` },
            SlackChannel.botPathToVictoryIssues,
          )
          return { message: 'not ok' }
        }

        this.logger.debug('race data', raceData)
        // queueMessage.data = { campaignId, ...raceData }

        queueMessage = {
          type: 'pathToVictory',
          data: {
            campaignId: campaignId.toString(),
            ...raceData,
          },
        }

        // Update Campaign details
        if (details) {
          await this.prisma.campaign.update({
            where: { id: campaign.id },
            data: {
              details: {
                ...details,
                ...(raceData && {
                  officeTermLength: raceData.electionTerm,
                  electionDate: raceData.electionDate,
                  level: raceData.electionLevel,
                  state: raceData.electionState,
                  county: raceData.electionCounty,
                  city: raceData.electionMunicipality,
                  district: raceData.subAreaValue,
                  partisanType: raceData.partisanType,
                  priorElectionDates: raceData.priorElectionDates,
                  positionId: raceData.positionId,
                  tier: raceData.tier,
                }),
              },
            },
          })
        }
      } else {
        const user = await this.prisma.user.findUnique({
          where: { id: campaign.userId },
        })
        this.logger.debug('campaign does not have race_id. skipping p2v...')

        if (user) {
          await this.sendVictoryIssuesSlackMessage(campaign, user)
        }
        return { message: 'ok' }
      }

      if (campaign.pathToVictory && queueMessage) {
        const p2vData = campaign.pathToVictory.data || {}
        // If electionType and electionLocation are already specified
        // we can skip those steps and just do the counts
        if (p2vData?.electionType && p2vData?.electionLocation) {
          queueMessage.data.electionType = p2vData.electionType
          queueMessage.data.electionLocation = p2vData.electionLocation
        }
      }

      this.logger.debug('queueing Message', queueMessage)
      await this.queueService.sendMessage(queueMessage)
      return { message: 'ok' }
    } catch (e) {
      this.logger.error('error at enqueue', e)
      await this.slackService.errorMessage({
        message: 'error at enqueue p2v',
        error: e,
      })
      return { message: 'not ok', error: e }
    }
  }

  private async sendVictoryIssuesSlackMessage(campaign: Campaign, user: User) {
    const { slug, data: details } = campaign
    const { office, state, city, district } =
      (details as PrismaJson.CampaignDetails) || {}
    const appBase = process.env.WEBAPP_ROOT

    const resolvedName = user?.firstName
      ? `${user.firstName} ${user.lastName}`
      : user?.name || 'n/a'

    const message = `
*Candidate did not select a standard position.*
${appBase}

*We need to manually add their admin Path to victory*

Name: ${resolvedName}
Office: ${office || 'n/a'}
State: ${state || 'n/a'}
City: ${city || 'n/a'}
District: ${district || 'n/a'}
email: ${user.email}
slug: ${slug}

admin link: ${appBase}/admin/victory-path/${slug}
`

    await this.slackService.message(
      { body: message },
      SlackChannel.botPathToVictoryIssues,
    )
  }
}
