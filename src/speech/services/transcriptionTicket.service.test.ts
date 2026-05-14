import { UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TranscriptionTicketService } from './transcriptionTicket.service'

const SECRET = 'test-secret-do-not-use-in-prod'

const makeJwt = () =>
  new JwtService({ secret: SECRET, signOptions: { expiresIn: '60s' } })

const buildService = () => new TranscriptionTicketService(makeJwt())

const mintInput = () => ({
  userId: 123,
  electedOfficeId: 'eo-456',
  target: { type: 'note' as const, id: 'note-789' },
})

const decodePayload = (ticket: string): Record<string, unknown> =>
  JSON.parse(
    Buffer.from(ticket.split('.')[1] as string, 'base64url').toString('utf8'),
  ) as Record<string, unknown>

describe('TranscriptionTicketService.mint', () => {
  let service: TranscriptionTicketService

  beforeEach(() => {
    service = buildService()
  })

  it('returns a JWT with three dot-delimited segments', () => {
    const result = service.mint(mintInput())
    expect(result.ticket.split('.')).toHaveLength(3)
  })

  it('returns an expiresAt roughly 60 seconds in the future', () => {
    const before = Date.now()
    const result = service.mint(mintInput())
    const after = Date.now()
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 59_000)
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + 61_000)
  })

  it('encodes user id, elected office id, target type, and target id in the payload', () => {
    const result = service.mint(mintInput())
    const payload = decodePayload(result.ticket)
    expect(payload).toMatchObject({
      uid: 123,
      eoid: 'eo-456',
      tt: 'note',
      tid: 'note-789',
      typ: 'transcription_ticket',
    })
  })

  it('encodes a UUID jti claim', () => {
    const result = service.mint(mintInput())
    const payload = decodePayload(result.ticket)
    expect(payload.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('mints a unique jti per call', () => {
    const a = service.mint(mintInput())
    const b = service.mint(mintInput())
    expect(decodePayload(a.ticket).jti).not.toBe(decodePayload(b.ticket).jti)
  })
})

describe('TranscriptionTicketService.verify', () => {
  let service: TranscriptionTicketService

  beforeEach(() => {
    service = buildService()
  })

  it('returns the payload for a valid ticket', () => {
    const minted = service.mint(mintInput())
    const payload = service.verify(minted.ticket)
    expect(payload).toMatchObject({
      uid: 123,
      eoid: 'eo-456',
      tt: 'note',
      tid: 'note-789',
      typ: 'transcription_ticket',
    })
  })

  it('throws UnauthorizedException for a malformed ticket', () => {
    expect(() => service.verify('not-a-jwt')).toThrow(UnauthorizedException)
  })

  it('throws UnauthorizedException for a ticket signed with a different secret', () => {
    const otherJwt = new JwtService({
      secret: 'different-secret',
      signOptions: { expiresIn: '60s' },
    })
    const otherService = new TranscriptionTicketService(otherJwt)
    const foreign = otherService.mint(mintInput())
    expect(() => service.verify(foreign.ticket)).toThrow(UnauthorizedException)
  })

  it('rejects a JWT signed with the same secret but missing the transcription typ claim', () => {
    const sharedJwt = makeJwt()
    const otherTokenForSamePayload = sharedJwt.sign(
      { uid: 1, eoid: 'e', sub: 'something-else' },
      { expiresIn: 60 },
    )
    expect(() => service.verify(otherTokenForSamePayload)).toThrow(
      UnauthorizedException,
    )
    expect(() => service.verify(otherTokenForSamePayload)).toThrow(
      /Invalid ticket payload/,
    )
  })

  it('rejects an expired ticket with an expiry-specific message', () => {
    const start = new Date('2026-05-14T12:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(start)
    try {
      const minted = service.mint(mintInput())
      vi.setSystemTime(new Date(start.getTime() + 61_000))
      expect(() => service.verify(minted.ticket)).toThrow(UnauthorizedException)
      expect(() => service.verify(minted.ticket)).toThrow(/expired/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a ticket on the second use (replay defense)', () => {
    const minted = service.mint(mintInput())
    service.verify(minted.ticket)
    expect(() => service.verify(minted.ticket)).toThrow(UnauthorizedException)
    expect(() => service.verify(minted.ticket)).toThrow(/already used/)
  })
})
