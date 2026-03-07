import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { typeToQuery } from './voterFile.util'

describe('typeToQuery', () => {
  const logger = createMockLogger()

  it('throws data-integrity error when district context is missing', () => {
    const campaign = {
      id: 1,
      details: { state: 'CA', electionDate: '2026-11-03' },
      pathToVictory: { data: { electionType: 'City' } },
    } as never

    expect(() => typeToQuery(logger, 'full', campaign)).toThrow(
      BadRequestException,
    )

    try {
      typeToQuery(logger, 'full', campaign)
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          errorCode: 'DATA_INTEGRITY_P2V_ELECTION_INFO_MISSING',
        }),
      })
    }
  })

  it('allows statewide queries without district context', () => {
    const campaign = {
      id: 2,
      details: { state: 'CA', electionDate: '2026-11-03' },
      pathToVictory: { data: { electionType: 'State' } },
    } as never

    const query = typeToQuery(logger, 'full', campaign, undefined, true)
    expect(query).toContain('FROM public."VoterCA"')
  })
})
