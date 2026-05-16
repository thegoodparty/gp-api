import { HttpStatus } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { TranscriptionTicketService } from '@/speech/services/transcriptionTicket.service'
import { TRANSCRIBE_STREAM_PATH } from '@/speech/ws/speechToText.gateway'
import { useTestService } from '@/test-service'

const service = useTestService()

const SESSION_PATH = '/v1/speech/transcribe/session'

// `PUBLIC_API_URL` is read at module load time by SpeechToTextService, so it
// must be set in .env.test before bootstrap. Mirroring that value here keeps
// the assertion source-of-truth alongside the test.
const EXPECTED_PUBLIC_API_URL = 'http://test-api.local:3000'

describe('POST /v1/speech/transcribe/session (integration)', () => {
  it('mints a session whose wsUrl is built from PUBLIC_API_URL + stream path + ticket', async () => {
    expect(process.env.PUBLIC_API_URL).toBe(EXPECTED_PUBLIC_API_URL)

    const before = Date.now()
    const res = await service.client.post(SESSION_PATH, {})
    const after = Date.now()

    expect(res.status).toBe(HttpStatus.CREATED)
    expect(res.data).toEqual({
      wsUrl: expect.any(String),
      expiresAt: expect.any(String),
    })

    const url = new URL(res.data.wsUrl)
    // Scheme must be flipped from http(s) to ws(s) by buildWsUrl.
    expect(url.protocol).toBe('ws:')
    // The host (host + port) must match PUBLIC_API_URL exactly so the
    // browser's defense-in-depth host check in useDictation passes.
    expect(url.host).toBe(new URL(EXPECTED_PUBLIC_API_URL).host)
    expect(url.pathname).toBe(TRANSCRIBE_STREAM_PATH)

    const ticket = url.searchParams.get('ticket')
    expect(ticket).toBeTruthy()

    // The ticket should be a valid JWT that decodes back to the logged-in
    // user and the transcription-specific typ claim, proving the gateway
    // can authorise the resulting WebSocket connection.
    const ticketService = service.app.get(TranscriptionTicketService)
    const payload = ticketService.verify(ticket as string)
    expect(payload).toMatchObject({
      uid: service.user.id,
      typ: 'transcription_ticket',
    })

    const expiresMs = new Date(res.data.expiresAt).getTime()
    expect(Number.isNaN(expiresMs)).toBe(false)
    // Ticket TTL is 60s; allow a generous window for test machine slop.
    expect(expiresMs).toBeGreaterThanOrEqual(before + 55_000)
    expect(expiresMs).toBeLessThanOrEqual(after + 65_000)
  })

  it('rejects unauthenticated requests', async () => {
    const res = await service.client.post(
      SESSION_PATH,
      {},
      { headers: { Authorization: 'Bearer not-a-real-token' } },
    )
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED)
  })
})
