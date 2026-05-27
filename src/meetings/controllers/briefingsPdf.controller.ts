import {
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import { PublicAccess } from '@/authentication/decorators/PublicAccess.decorator'
import { getEnv } from '@/shared/util/env.util'
import { BriefingPdfService } from '../services/briefingPdf.service'
import { BriefingsPdfRateLimitGuard } from './briefingsPdfRateLimit.guard'

/**
 * Public PDF endpoint for briefings. Mounted at `/v1/briefings/:uuid`.
 *
 * Intentionally lives outside the elected-office-scoped meetings controller
 * because share links must work for unauthenticated recipients (the briefing
 * UUID is the share secret). The matching gp-webapp Vercel rewrite exposes
 * the same handler at `goodparty.org/api/v1/briefings/:uuid` so the URL we
 * embed in mailto:/sms: payloads lives on the marketing domain.
 *
 * Hardening notes:
 * - `ParseUUIDPipe({ version: '7' })` rejects anything that doesn't match the
 *   row's `uuid(7)` primary-key format, narrowing the brute-force search
 *   space and tying the validation to the format we actually issue.
 * - `BriefingsPdfRateLimitGuard` puts a per-IP token bucket in front of the
 *   handler. This is a stopgap; real production rate limiting belongs at
 *   the edge (Vercel/Cloudflare WAF).
 * - Every hit is logged with a *truncated* briefing-id prefix so operators
 *   can correlate abuse patterns without the full share token landing in
 *   any log sink. The NestJS request-id (injected by the global logger)
 *   already provides per-request correlation if more precision is needed.
 */
@Controller('briefings')
@UseGuards(BriefingsPdfRateLimitGuard)
export class BriefingsPdfController {
  private readonly logger = new Logger(BriefingsPdfController.name)

  constructor(private readonly briefingPdf: BriefingPdfService) {}

  @PublicAccess()
  @Get(':uuid')
  async getBriefingPdf(
    @Param('uuid', new ParseUUIDPipe({ version: '7' })) uuid: string,
  ): Promise<StreamableFile> {
    // The full UUID is the share secret — anyone who reads the logs would
    // otherwise harvest valid share tokens, bypassing the rate-limit guard.
    // The 8-character prefix is enough to disambiguate adjacent requests
    // when triaging together with the global request-id.
    this.logger.log(`getBriefingPdf: serving briefing ${uuid.slice(0, 8)}…`)
    const liveBriefingBaseUrl = getEnv('APP_ROOT_URL')
    const { buffer, filename } = await this.briefingPdf.renderById(
      uuid,
      liveBriefingBaseUrl,
    )
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      // RFC 6266: emit the filename with URI-encoded UTF-8 so the parser owns
      // escaping. The fallback ASCII `filename=` retains compatibility for
      // legacy mail clients that don't grok `filename*=`.
      disposition: `inline; filename="${asciiFallback(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      length: buffer.length,
    })
  }
}

/**
 * Strip non-ASCII codepoints from a filename so the legacy `filename=`
 * portion of a Content-Disposition header parses safely on clients that
 * ignore `filename*`. `buildSlug` already restricts the slug to ASCII for
 * city-council briefings today, but `slugify` is configurable and this
 * fallback is cheap insurance.
 */
function asciiFallback(filename: string): string {
  // eslint-disable-next-line no-control-regex
  return filename.replace(/[^\x20-\x7e]/g, '_')
}
