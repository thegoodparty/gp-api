import { BadRequestException } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { VoterFileType } from '../voterFile.types'
import { typeToQuery } from './voterFile.util'

const logger = createMockLogger()

const makeCampaign = (
  state: string | undefined,
): Campaign =>
  ({
    id: 1,
    details: {
      state,
      ballotLevel: 'CITY',
      electionDate: '2026-11-03',
    },
  }) as unknown as Campaign

const district = {
  id: '1',
  l2Type: 'City',
  l2Name: 'Springfield',
}

describe('typeToQuery state validation', () => {
  it('rejects a null/undefined state', () => {
    expect(() =>
      typeToQuery(
        logger,
        VoterFileType.full,
        makeCampaign(undefined),
        district,
      ),
    ).toThrow(BadRequestException)
  })

  it('rejects an empty string state', () => {
    expect(() =>
      typeToQuery(
        logger,
        VoterFileType.full,
        makeCampaign(''),
        district,
      ),
    ).toThrow(BadRequestException)
  })

  it('rejects a SQL injection payload', () => {
    expect(() =>
      typeToQuery(
        logger,
        VoterFileType.full,
        makeCampaign('CA"; SELECT pg_sleep(10); --'),
        district,
      ),
    ).toThrow(BadRequestException)
  })

  it('rejects an arbitrary string', () => {
    expect(() =>
      typeToQuery(
        logger,
        VoterFileType.full,
        makeCampaign('NOTASTATE'),
        district,
      ),
    ).toThrow(BadRequestException)
  })

  it('accepts a valid uppercase state code', () => {
    const query = typeToQuery(
      logger,
      VoterFileType.full,
      makeCampaign('CA'),
      district,
    )
    expect(query).toContain('"VoterCA"')
  })

  it('normalizes a lowercase state to uppercase in the query', () => {
    const query = typeToQuery(
      logger,
      VoterFileType.full,
      makeCampaign('ca'),
      district,
    )
    expect(query).toContain('"VoterCA"')
    expect(query).not.toContain('"Voterca"')
  })

  it('normalizes mixed-case state to uppercase', () => {
    const query = typeToQuery(
      logger,
      VoterFileType.full,
      makeCampaign('Ca'),
      district,
    )
    expect(query).toContain('"VoterCA"')
  })

  it('uses normalized state in directMail subquery', () => {
    const query = typeToQuery(
      logger,
      VoterFileType.directMail,
      makeCampaign('co'),
      district,
    )
    expect(query).toContain('"VoterCO"')
    expect(query).not.toContain('"Voterco"')
  })
})
