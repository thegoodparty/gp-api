import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { PinoLogger } from 'nestjs-pino'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { DomainsService } from '../services/domains.service'
import { InboundDomainVerificationEmailZ } from '../schemas/InboundDomainVerificationEmail.schema'
import { VercelDomainEmailParserService } from '../services/vercelDomainEmailParser.service'

const { INBOUND_DOMAIN_EMAIL_WEBHOOK_SECRET } = process.env

@Controller('websites/inbound-domain-verification-email')
export class InboundDomainVerificationController {
  constructor(
    private readonly domains: DomainsService,
    private readonly parser: VercelDomainEmailParserService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(InboundDomainVerificationController.name)
  }

  @Post()
  @PublicAccess()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: { rawBody?: Buffer | string },
    @Headers('x-webhook-signature') signature: string | undefined,
    @Body() body: unknown,
  ) {
    this.assertSignature(req.rawBody, signature)

    const parsedBody = InboundDomainVerificationEmailZ.parse(body)
    const parsed = this.parser.parse(parsedBody)
    if (!parsed) {
      this.logger.warn(
        {
          from: parsedBody.from,
          subject: parsedBody.subject,
        },
        'Inbound email did not match Vercel verification shape; ignoring',
      )
      return { matched: false }
    }

    const result = await this.domains.submitRegistrantVerification(
      parsed.domain,
      parsed.verificationUrl,
    )

    return { matched: true, ...result }
  }

  private assertSignature(
    rawBody: Buffer | string | undefined,
    signature: string | undefined,
  ): void {
    if (!INBOUND_DOMAIN_EMAIL_WEBHOOK_SECRET) {
      throw new InternalServerErrorException(
        'INBOUND_DOMAIN_EMAIL_WEBHOOK_SECRET is not configured',
      )
    }
    if (!signature) {
      throw new BadRequestException('Missing x-webhook-signature header')
    }
    if (rawBody === undefined) {
      throw new BadRequestException('Raw request body is required')
    }

    const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody)
    const expected = createHmac('sha256', INBOUND_DOMAIN_EMAIL_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex')
    const provided = Buffer.from(signature, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (
      provided.length !== expectedBuf.length ||
      !timingSafeEqual(provided, expectedBuf)
    ) {
      throw new UnauthorizedException('Invalid webhook signature')
    }
  }
}
