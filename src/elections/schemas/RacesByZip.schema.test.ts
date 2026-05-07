import { describe, expect, it } from 'vitest'
import { RacesByZipSchema } from './RacesByZip.schema'

describe('RacesByZipSchema', () => {
  it('accepts a zipcode-only query', () => {
    expect(() => RacesByZipSchema.create({ zipcode: '90210' })).not.toThrow()
  })

  it('accepts a name-only query', () => {
    expect(() => RacesByZipSchema.create({ name: 'Smith' })).not.toThrow()
  })

  it('accepts an officeType-only query (single string coerced to array)', () => {
    expect(() => RacesByZipSchema.create({ officeType: 'Mayor' })).not.toThrow()
  })

  it('accepts an officeType-only query (array)', () => {
    expect(() =>
      RacesByZipSchema.create({ officeType: ['Mayor', 'School Board'] }),
    ).not.toThrow()
  })

  it('rejects a query with none of zipcode, name, or officeType', () => {
    expect(() => RacesByZipSchema.create({})).toThrow(
      /at least one of zipcode, name, or officeType is required/i,
    )
  })

  it('rejects a query with only level + electionDate', () => {
    expect(() =>
      RacesByZipSchema.create({ level: 'CITY', electionDate: '2026-11-03' }),
    ).toThrow(/at least one of zipcode, name, or officeType is required/i)
  })

  it('rejects an empty officeType array as the only filter', () => {
    expect(() => RacesByZipSchema.create({ officeType: [] })).toThrow(
      /at least one of zipcode, name, or officeType is required/i,
    )
  })
})
