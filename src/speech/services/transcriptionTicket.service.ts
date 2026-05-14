import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService, TokenExpiredError } from '@nestjs/jwt'
import { randomUUID } from 'crypto'
import { addSeconds } from 'date-fns'
import { z } from 'zod'
import {
  SpeechToTextTargetType,
  SpeechToTextTargetTypeSchema,
} from '@goodparty_org/contracts'

const TICKET_TTL_SECONDS = 60
const SEEN_JTI_CAPACITY = 4096
const TICKET_TYP = 'transcription_ticket' as const

const TicketPayloadSchema = z.object({
  uid: z.number().int().positive(),
  eoid: z.string().min(1),
  tt: SpeechToTextTargetTypeSchema,
  tid: z.string().min(1),
  jti: z.string().min(1),
  typ: z.literal(TICKET_TYP),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
})

export type TranscriptionTicketPayload = z.infer<typeof TicketPayloadSchema>

export type MintTicketInput = {
  userId: number
  electedOfficeId: string
  target: {
    type: SpeechToTextTargetType
    id: string
  }
}

export type MintedTicket = {
  ticket: string
  expiresAt: Date
}

@Injectable()
export class TranscriptionTicketService {
  private readonly seenJtis: Set<string> = new Set()

  constructor(private readonly jwtService: JwtService) {}

  mint(input: MintTicketInput): MintedTicket {
    const jti = randomUUID()
    const expiresAt = addSeconds(new Date(), TICKET_TTL_SECONDS)
    const ticket = this.jwtService.sign(
      {
        uid: input.userId,
        eoid: input.electedOfficeId,
        tt: input.target.type,
        tid: input.target.id,
        jti,
        typ: TICKET_TYP,
      },
      { expiresIn: TICKET_TTL_SECONDS },
    )
    return { ticket, expiresAt }
  }

  verify(ticket: string): TranscriptionTicketPayload {
    let raw: unknown
    try {
      raw = this.jwtService.verify(ticket)
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException('Ticket has expired')
      }
      throw new UnauthorizedException('Invalid ticket')
    }
    const parsed = TicketPayloadSchema.safeParse(raw)
    if (!parsed.success) {
      throw new UnauthorizedException('Invalid ticket payload')
    }
    if (this.seenJtis.has(parsed.data.jti)) {
      throw new UnauthorizedException('Ticket already used')
    }
    this.rememberJti(parsed.data.jti)
    return parsed.data
  }

  private rememberJti(jti: string) {
    if (this.seenJtis.size >= SEEN_JTI_CAPACITY) {
      const oldest = this.seenJtis.values().next().value
      if (oldest !== undefined) {
        this.seenJtis.delete(oldest)
      }
    }
    this.seenJtis.add(jti)
  }
}
