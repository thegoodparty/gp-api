import { describe, expect, it } from 'vitest'
import { VoterFileType } from '../voterFile.types'
import { GetVoterFileSchema } from './GetVoterFile.schema'

const schema = GetVoterFileSchema.schema

const parseType = (type: string) => schema.safeParse({ type })

describe('GetVoterFileSchema type preprocessing', () => {
  it.each([
    ['doorknocking', VoterFileType.doorKnocking],
    ['directmail', VoterFileType.directMail],
    ['digitalads', VoterFileType.digitalAds],
    ['telemarketing', VoterFileType.telemarketing],
  ])('maps lowercase %s to %s', (input, expected) => {
    const result = parseType(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe(expected)
    }
  })

  it('accepts already-correct camelCase values', () => {
    expect(parseType('digitalAds').success).toBe(true)
    expect(parseType('doorKnocking').success).toBe(true)
  })

  it('accepts lowercase-only values without mapping', () => {
    expect(parseType('full').success).toBe(true)
    expect(parseType('sms').success).toBe(true)
    expect(parseType('text').success).toBe(true)
  })

  it('rejects invalid type values', () => {
    expect(parseType('invalidType').success).toBe(false)
  })
})
