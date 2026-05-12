import { BadGatewayException } from '@nestjs/common'

/**
 * Tags a failure with the pipeline step that produced it, so the failure
 * Slack notification can tell CAS where things broke. Extends BadGatewayException
 * because the steps tagged this way are all upstream-vendor calls (TCR, Peerly).
 * Validation errors and DB errors propagate as their natural HttpException /
 * Prisma error and get classified separately by the interceptor.
 */
export type OutreachStep =
  | 'validation'
  | 'tcrLookup'
  | 'geographyResolution'
  | 'peerlyMediaUpload'
  | 'peerlyJobCreation'
  | 'peerlyListAssignment'
  | 'dbWrite'
  | 'unknown'

export class OutreachStepError extends BadGatewayException {
  constructor(
    public readonly step: OutreachStep,
    public readonly cause: unknown,
  ) {
    super(
      `Outreach pipeline failed at step "${step}": ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    )
    this.name = 'OutreachStepError'
  }
}
