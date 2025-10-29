import { Injectable, Logger } from '@nestjs/common'
import Analytics, { TrackParams } from '@segment/analytics-node'
import { pickKeys } from 'src/shared/util/objects.util'
import { SEGMENT_KEYS } from './segment.schema'
import {
  SegmentIdentityTraits,
  SegmentTrackEventProperties,
  UserContext,
} from './segment.types'

@Injectable()
export class SegmentService {
  private analytics: Analytics
  private readonly logger = new Logger(SegmentService.name)

  constructor() {
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
    userContext?: UserContext,
  ): Promise<TrackParams> {
    try {
      const stringId = String(userId)

      const eventConfig: TrackParams = {
        event,
        userId: stringId,
        properties,
      }

      if (userContext) {
        const traits: Record<string, string> = {}

        if (userContext.email !== undefined) {
          traits.email = userContext.email as string
        }
        if (userContext.hubspotId !== undefined) {
          traits.hubspotId = userContext.hubspotId as string
        }

        if (Object.keys(traits).length > 0) {
          eventConfig.context = { traits }
        }
      }

      await this.analytics.track(eventConfig)
      this.logger.debug(
        `[SEGMENT] Event tracked - Event: ${event}, User: ${userId}`,
      )
      return eventConfig
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.logger.error(
        `[SEGMENT] Failed to track event: ${event} for user: ${userId}`,
        error,
      )
      throw error
    }
  }

  async identify(
    userId: number,
    traits: SegmentIdentityTraits,
    userContext?: UserContext,
  ): Promise<void> {
    try {
      const segmentProps = pickKeys(traits, SEGMENT_KEYS)
      const stringId = String(userId)

      const identifyTraits = {
        ...segmentProps,
        ...(userContext ?? {}),
      } as Record<string, unknown>

      await this.analytics.identify({
        userId: stringId,
        traits: identifyTraits,
      })
      this.logger.debug(`[SEGMENT] User identified - User: ${userId}`)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.logger.error(`[SEGMENT] Failed to identify user: ${userId}`, error)
      throw error
    }
  }
}
