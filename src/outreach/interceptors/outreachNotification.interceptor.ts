import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Campaign, User } from '../../generated/prisma'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { from, Observable, throwError } from 'rxjs'
import { catchError, mergeMap } from 'rxjs/operators'
import { CreateOutreachSchema } from '../schemas/createOutreachSchema'
import { OutreachNotificationService } from '../services/outreachNotification.service'
import { OutreachStep, OutreachStepError } from '../types/outreachStepError'

/**
 * Wraps the outreach controller pipeline. On any thrown exception, fires the
 * failure notification to CAS first (so we never silently lose a paid attempt),
 * then re-throws so the global Prisma/Http exception filters produce the actual
 * HTTP response. The slack call is awaited via the rxjs chain — adding a small
 * latency on the failure path in exchange for deterministic ordering.
 *
 * Must be applied OUTSIDE FilesInterceptor so multipart-parse failures (bad MIME,
 * oversize) reach this catchError.
 */
@Injectable()
export class OutreachNotificationInterceptor implements NestInterceptor {
  constructor(
    private readonly notify: OutreachNotificationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OutreachNotificationInterceptor.name)
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<
      FastifyRequest & {
        user?: User
        campaign?: Campaign
        body?: Partial<CreateOutreachSchema>
      }
    >()

    return next.handle().pipe(
      catchError((err: unknown) =>
        from(this.fireFailureSlack(err, req)).pipe(
          // fireFailureSlack catches its own errors; this is a defensive net so
          // a future internal-throw can't replace `err` with the slack failure.
          catchError(() => from(Promise.resolve())),
          mergeMap(() => throwError(() => err)),
        ),
      ),
    )
  }

  private async fireFailureSlack(
    err: unknown,
    req: {
      user?: User
      campaign?: Campaign
      body?: Partial<CreateOutreachSchema>
    },
  ): Promise<void> {
    if (!req.user) return // unauthed — don't notify

    try {
      await this.notify.notifyFailure({
        user: req.user,
        campaign: req.campaign,
        createOutreachDto: req.body,
        step: classifyFailure(err),
        error: err,
      })
    } catch (slackErr) {
      this.logger.error(
        { slackErr, originalError: err },
        'CAS failure notification failed',
      )
    }
  }
}

const classifyFailure = (err: unknown): OutreachStep => {
  if (err instanceof OutreachStepError) return err.step
  if (err instanceof HttpException) {
    const status = err.getStatus()
    if (status >= 400 && status < 500) return 'validation'
  }
  return 'unknown'
}
