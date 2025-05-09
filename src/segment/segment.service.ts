// src/shared/segment/segment.service.ts
import { Injectable, Logger } from '@nestjs/common'
import Analytics from '@segment/analytics-node'
import { TrackingProperties } from 'src/analytics/analytics.types'

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

  trackEvent(
    userId: number,
    event: string,
    properties: Record<string, any> = {},
  ) {
    try {
      const stringId = String(userId)
      this.analytics.track({
        event,
        userId: stringId,
        properties,
      })
    } catch (err) {
      this.logger.error(`Failed to track event: ${event}`, err)
    }
  }

  identify(userId: number, traits: TrackingProperties) {
    try {
      const stringId = String(userId)
      this.analytics.identify({
        userId: stringId,
        traits,
      })
    } catch (err) {
      this.logger.error(`Failed to identify user: ${userId}`, err)
    }
  }
}
