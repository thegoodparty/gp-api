import { Injectable, Logger } from '@nestjs/common'
import Analytics from '@segment/analytics-node'
import { pickKeys } from 'src/shared/util/objects.util'
import { SEGMENT_KEYS } from './segment.schema'
import {
  SegmentIdentityTraits,
  SegmentTrackEventProperties,
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
  ): Promise<void> {
    try {
      const stringId = String(userId)
      this.analytics.track({
        event,
        userId: stringId,
        properties,
      })
      this.logger.debug(
        `[SEGMENT] Event queued for tracking - Event: ${event}, User: ${userId}`,
      )
    } catch (err) {
      this.logger.error(
        `[SEGMENT] Failed to track event: ${event} for user: ${userId}`,
        err,
      )
      throw err
    }
  }

  identify(userId: number, traits: SegmentIdentityTraits) {
    const segmentProps = pickKeys(traits, SEGMENT_KEYS)
    const stringId = String(userId)
    this.analytics.identify({ userId: stringId, traits: segmentProps })
  }
}
