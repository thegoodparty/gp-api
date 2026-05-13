import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainsService } from '../services/domains.service'
import { VercelDomainEmailParserService } from '../services/vercelDomainEmailParser.service'
import { InboundDomainVerificationController } from './inboundDomainVerification.controller'
import { InboundDomainVerificationEmailSchema } from '../schemas/InboundDomainVerificationEmail.schema'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

const WEBHOOK_SECRET = process.env.INBOUND_DOMAIN_EMAIL_WEBHOOK_SECRET as string

const signPayload = (raw: string): string =>
  createHmac('sha256', WEBHOOK_SECRET).update(Buffer.from(raw)).digest('hex')

const buildBody = (
  overrides: Partial<InboundDomainVerificationEmailSchema> = {},
): InboundDomainVerificationEmailSchema => {
  const body = new InboundDomainVerificationEmailSchema()
  body.from = 'no-reply@vercel.com'
  body.to = 'candidate-domains@goodparty.org'
  body.subject = 'Verify your domain foo.com'
  body.text = 'Click https://vercel.com/verify-domain?token=abc&domain=foo.com'
  body.html = ''
  return Object.assign(body, overrides)
}

describe('InboundDomainVerificationController', () => {
  let controller: InboundDomainVerificationController
  let mockDomains: {
    submitRegistrantVerification: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    expect(
      WEBHOOK_SECRET,
      '.env.test must define INBOUND_DOMAIN_EMAIL_WEBHOOK_SECRET',
    ).toBeTruthy()

    mockDomains = {
      submitRegistrantVerification: vi.fn().mockResolvedValue({
        domain: 'foo.com',
        alreadyVerified: false,
        registrantVerifiedAt: new Date('2026-05-13T00:00:00.000Z'),
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: DomainsService, useValue: mockDomains },
        VercelDomainEmailParserService,
        { provide: PinoLogger, useValue: createMockLogger() },
        InboundDomainVerificationController,
      ],
    }).compile()

    controller = module.get(InboundDomainVerificationController)
  })

  it('accepts a valid signature, parses the email, and dispatches to DomainsService', async () => {
    const body = buildBody()
    const raw = JSON.stringify(body)
    const result = await controller.receive(
      { rawBody: Buffer.from(raw) },
      signPayload(raw),
      body,
    )

    expect(mockDomains.submitRegistrantVerification).toHaveBeenCalledWith(
      'foo.com',
      'https://vercel.com/verify-domain?token=abc&domain=foo.com',
    )
    expect(result).toMatchObject({ matched: true, domain: 'foo.com' })
  })

  it('returns matched: false when the email is not from Vercel', async () => {
    const body = buildBody({ from: 'attacker@evil.com' })
    const raw = JSON.stringify(body)

    const result = await controller.receive(
      { rawBody: Buffer.from(raw) },
      signPayload(raw),
      body,
    )

    expect(result).toEqual({ matched: false })
    expect(mockDomains.submitRegistrantVerification).not.toHaveBeenCalled()
  })

  it('rejects requests with no signature header (400)', async () => {
    const body = buildBody()
    const raw = JSON.stringify(body)

    await expect(
      controller.receive({ rawBody: Buffer.from(raw) }, undefined, body),
    ).rejects.toMatchObject({ status: 400 })
    expect(mockDomains.submitRegistrantVerification).not.toHaveBeenCalled()
  })

  it('rejects requests with an invalid signature (401)', async () => {
    const body = buildBody()
    const raw = JSON.stringify(body)
    const tampered = signPayload(raw + 'tamper')

    await expect(
      controller.receive({ rawBody: Buffer.from(raw) }, tampered, body),
    ).rejects.toMatchObject({ status: 401 })
    expect(mockDomains.submitRegistrantVerification).not.toHaveBeenCalled()
  })

  it('rejects requests with a malformed-hex signature (401)', async () => {
    const body = buildBody()
    const raw = JSON.stringify(body)

    await expect(
      controller.receive({ rawBody: Buffer.from(raw) }, 'not-hex-at-all', body),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('rejects requests with no raw body (400)', async () => {
    const body = buildBody()
    const raw = JSON.stringify(body)

    await expect(
      controller.receive({ rawBody: undefined }, signPayload(raw), body),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('propagates NotFoundException when the parsed domain is not managed', async () => {
    const body = buildBody()
    const raw = JSON.stringify(body)
    mockDomains.submitRegistrantVerification.mockRejectedValueOnce(
      new NotFoundException('No managed domain found matching foo.com'),
    )

    await expect(
      controller.receive({ rawBody: Buffer.from(raw) }, signPayload(raw), body),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})
