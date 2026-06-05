import { describe, expect, it } from 'vitest'
import { formatL2DistrictName } from './formatDistrictName.util'

describe('formatL2DistrictName', () => {
  it('title-cases an all-caps ward name', () => {
    expect(formatL2DistrictName('CHEYENNE CITY WARD 1', 'City_Ward')).toBe(
      'Cheyenne City Ward 1',
    )
  })

  it('adds type context to bare numeric legislative districts and drops leading zeros', () => {
    expect(formatL2DistrictName('1', 'State_House_District')).toBe(
      'State House District 1',
    )
    expect(formatL2DistrictName('001', 'State_House_District')).toBe(
      'State House District 1',
    )
    expect(formatL2DistrictName('05', 'US_Congressional_District')).toBe(
      'US Congressional District 5',
    )
    expect(formatL2DistrictName('10', 'State_Senate_District')).toBe(
      'State Senate District 10',
    )
  })

  it('expands common L2 abbreviations in county/commissioner names', () => {
    expect(
      formatL2DistrictName(
        'BAILEY CNTY COMM DIST 1',
        'County_Commissioner_District',
      ),
    ).toBe('Bailey County Commissioner District 1')
    expect(
      formatL2DistrictName(
        'ALBANY CNTY LEG DIST 23',
        'County_Legislative_District',
      ),
    ).toBe('Albany County Legislative District 23')
    expect(
      formatL2DistrictName(
        'ALAMEDA CNTY SUP DIST 3 (2022)',
        'County_Supervisorial_District',
      ),
    ).toBe('Alameda County Supervisorial District 3')
  })

  it('expands borough / village / council / school-board abbreviations', () => {
    expect(formatL2DistrictName('ARENDTSVILLE BORO', 'Borough')).toBe(
      'Arendtsville Borough',
    )
    expect(formatL2DistrictName('BAILEY LAKES VLG', 'Village')).toBe(
      'Bailey Lakes Village',
    )
    expect(
      formatL2DistrictName(
        'BERKELEY CITY CNCL 4',
        'City_Council_Commissioner_District',
      ),
    ).toBe('Berkeley City Council 4')
    expect(
      formatL2DistrictName(
        'ALACHUA CNTY SCHL BD DIST 4',
        'School_Board_District',
      ),
    ).toBe('Alachua County School Board District 4')
  })

  it('keeps acronyms upper-cased instead of mangling them', () => {
    expect(
      formatL2DistrictName('HALL HS DIST 502', 'High_School_District'),
    ).toBe('Hall HS District 502')
    expect(formatL2DistrictName('SAN FELIPE FD', 'Fire_District')).toBe(
      'San Felipe FD',
    )
    expect(
      formatL2DistrictName('AMADOR CNTY USD', 'Unified_School_District'),
    ).toBe('Amador County USD')
  })

  it('strips leading zeros on trailing numbers', () => {
    expect(formatL2DistrictName('ALBANY CITY WARD 02', 'City_Ward')).toBe(
      'Albany City Ward 2',
    )
  })

  it('drops parentheticals and preserves compound hyphenated names', () => {
    expect(
      formatL2DistrictName(
        'ALBANY CNTY-EAST ALBANY CCD (EST.)',
        'County_Commissioner_District',
      ),
    ).toBe('Albany County-East Albany CCD')
    expect(
      formatL2DistrictName(
        'BOLIVAR-RICHBURG CENTRAL SD (EST.)',
        'Unified_School_District',
      ),
    ).toBe('Bolivar-Richburg Central SD')
  })

  it('title-cases a plain city/county name', () => {
    expect(formatL2DistrictName('CHEYENNE CITY', 'City')).toBe('Cheyenne City')
    expect(formatL2DistrictName('ALAMEDA', 'County')).toBe('Alameda')
  })

  it('returns null for empty/blank names', () => {
    expect(formatL2DistrictName(null)).toBeNull()
    expect(formatL2DistrictName(undefined)).toBeNull()
    expect(formatL2DistrictName('   ')).toBeNull()
  })

  it('keeps a bare number when no type context is available', () => {
    expect(formatL2DistrictName('5', null)).toBe('5')
  })
})
