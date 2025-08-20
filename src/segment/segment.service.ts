// src/shared/segment/segment.service.ts
import { Injectable, Logger } from '@nestjs/common'
import Analytics from '@segment/analytics-node'
import { pickKeys } from 'src/shared/util/objects.util'
import { SEGMENT_KEYS } from './segment.schema'

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    properties: Record<string, unknown> = {},
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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  identify(userId: number, traits: Record<string, unknown>) {
    const segmentProps = pickKeys(traits, SEGMENT_KEYS)
    const stringId = String(userId)
    this.analytics.identify({ userId: stringId, traits: segmentProps })
  }
}
