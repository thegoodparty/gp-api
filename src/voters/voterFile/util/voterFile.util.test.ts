import { BadRequestException } from '@nestjs/common'
import { Campaign } from '../../../generated/prisma'
import { PinoLogger } from 'nestjs-pino'
import { describe, expect, it, vi } from 'vitest'
import { VoterFileType } from '../voterFile.types'
import { typeToQuery } from './voterFile.util'

const logger = {
  debug: vi.fn(),
  warn: vi.fn(),
} as unknown as PinoLogger

const statewideCampaign = (state: string | null | undefined) =>
  ({
    id: 1,
    organizationSlug: 'test-org',
    details: { state },
  }) as unknown as Campaign

const statewideDistrict = {
  id: 'dist-1',
  state: 'CO',
  l2Type: 'State',
  l2Name: 'CO',
}

describe('typeToQuery state validation', () => {
  it('throws BadRequestException for an invalid state', () => {
    expect(() =>
      typeToQuery(
        logger,
        VoterFileType.full,
        statewideCampaign('XX'),
        statewideDistrict,
      ),
    ).toThrow(BadRequestException)
  })

  it('does not throw for a valid uppercase state', () => {
    const sql = typeToQuery(
      logger,
      VoterFileType.full,
      statewideCampaign('CO'),
      statewideDistrict,
    )
    expect(sql).toContain('FROM public."VoterCO"')
  })

  it('accepts a lowercase state by uppercasing it', () => {
    const sql = typeToQuery(
      logger,
      VoterFileType.full,
      statewideCampaign('co'),
      statewideDistrict,
    )
    expect(sql).toContain('FROM public."VoterCO"')
  })

  it('throws when state is undefined', () => {
    expect(() =>
      typeToQuery(
        logger,
        VoterFileType.full,
        statewideCampaign(undefined),
        statewideDistrict,
      ),
    ).toThrow(BadRequestException)
  })

  it('throws when state is null', () => {
    expect(() =>
      typeToQuery(
        logger,
        VoterFileType.full,
        statewideCampaign(null),
        statewideDistrict,
      ),
    ).toThrow(BadRequestException)
  })

  it('throws for a SQL injection payload', () => {
    expect(() =>
      typeToQuery(
        logger,
        VoterFileType.full,
        statewideCampaign('CO"; SELECT pg_sleep(10);--'),
        statewideDistrict,
      ),
    ).toThrow(BadRequestException)
  })
})
