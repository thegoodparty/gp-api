import { Injectable, Logger } from '@nestjs/common'
import Analytics, { TrackParams } from '@segment/analytics-node'
import { pickKeys } from 'src/shared/util/objects.util'
import { SEGMENT_KEYS } from './segment.schema'
import {
  SegmentIdentityTraits,
  SegmentTrackEventProperties,
} from './segment.types'
import { UsersService } from 'src/users/services/users.service'

@Injectable()
export class SegmentService {
  private analytics: Analytics
  private readonly logger = new Logger(SegmentService.name)

  constructor(private readonly users: UsersService) {
    const SEGMENT_WRITE_KEY = process.env.SEGMENT_WRITE_KEY
    if (!SEGMENT_WRITE_KEY) {
      throw new Error(
        'SEGMENT_WRITE_KEY is not defined. Please add it to your .env',
      )
    }
    this.analytics = new Analytics({ writeKey: SEGMENT_WRITE_KEY })
  }

  async trackEvent(
    userId: number,
    event: string,
    properties: SegmentTrackEventProperties = {},
  ): Promise<TrackParams> {
    try {
      const user = await this.users.findUser({ id: userId })
      const stringId = String(userId)
      const metaData = user?.metaData as PrismaJson.UserMetaData
      const hubspotId = metaData?.hubspotId

      const eventConfig: TrackParams = {
        event,
        userId: stringId,
        properties,
        context: {
          traits: {
            email: user?.email,
            hubspotId,
          },
        },
      }
      this.analytics.track(eventConfig)
      this.logger.debug(
        `[SEGMENT] Event queued for tracking - Event: ${event}, User: ${userId}`,
      )
      return eventConfig
    } catch (err) {
      this.logger.error(
        `[SEGMENT] Failed to track event: ${event} for user: ${userId}`,
        err,
      )
      throw err
    }
  }

  async identify(userId: number, traits: SegmentIdentityTraits) {
    const user = await this.users.findUser({ id: userId })
    const metaData = user?.metaData as PrismaJson.UserMetaData
    const hubspotId = metaData?.hubspotId

    const segmentProps = pickKeys(traits, SEGMENT_KEYS)
    const stringId = String(userId)
    this.analytics.identify({
      userId: stringId,
      traits: {
        ...segmentProps,
        email: user?.email,
        hubspotId,
      },
    })
  }
}
