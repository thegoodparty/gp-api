import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common'
import { PublicAccess } from '@/authentication/decorators/PublicAccess.decorator'
import { getEnv } from '@/shared/util/env.util'
import { BriefingPdfService } from '../services/briefingPdf.service'

/**
 * Public PDF endpoint for briefings. Mounted at `/v1/briefings/:uuid`.
 *
 * Intentionally lives outside the elected-office-scoped meetings controller
 * because share links must work for unauthenticated recipients (the briefing
 * UUID is the share secret). The matching gp-webapp Vercel rewrite exposes
 * the same handler at `goodparty.org/api/v1/briefings/:uuid` so the URL we
 * embed in mailto:/sms: payloads lives on the marketing domain.
 */
@Controller('briefings')
export class BriefingsPdfController {
  constructor(private readonly briefingPdf: BriefingPdfService) {}

  @PublicAccess()
  @Get(':uuid')
  async getBriefingPdf(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
  ): Promise<StreamableFile> {
    const liveBriefingBaseUrl = getEnv('APP_ROOT_URL')
    const { buffer, filename } = await this.briefingPdf.renderById(
      uuid,
      liveBriefingBaseUrl,
    )
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
      length: buffer.length,
    })
  }
}
