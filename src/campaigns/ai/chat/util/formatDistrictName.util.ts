// L2 voter-file district names come through raw and inconsistent — ALL CAPS,
// heavily abbreviated, and sometimes just a (zero-padded) number for
// legislative districts. This formats them into something human-readable for
// prompt personalization, using the district *type* for context when the name
// alone is ambiguous.
//
// Patterns are drawn from sampling the production voter file across states.
// Examples (name | type -> output):
//   "CHEYENNE CITY WARD 1" | City_Ward                  -> "Cheyenne City Ward 1"
//   "001"                  | State_House_District       -> "State House District 1"
//   "05"                   | US_Congressional_District  -> "US Congressional District 5"
//   "BAILEY CNTY COMM DIST 1" | County_Commissioner...  -> "Bailey County Commissioner District 1"
//   "ALACHUA CNTY SCHL BD DIST 4" | School_Board...     -> "Alachua County School Board District 4"
//   "ARENDTSVILLE BORO"    | Borough                    -> "Arendtsville Borough"
//   "ALBANY CNTY-EAST ALBANY CCD (EST.)" | County...    -> "Albany County-East Albany CCD"

// Tokens kept upper-cased rather than title-cased (acronyms L2 uses verbatim).
const ACRONYMS = new Set([
  'us',
  'cd',
  'hd',
  'sd',
  'ld',
  'ccd',
  'dma',
  'isd',
  'usd',
  'esd',
  'lsd',
  'fd',
  'fpd',
  'hs',
  'wsd',
  'tv',
])

// Unambiguous abbreviation expansions (whole token, case-insensitive). Kept
// conservative: only abbreviations whose meaning is consistent in L2 district
// names are expanded; genuinely ambiguous ones (e.g. "CO") are left alone.
const WORD_REPLACEMENTS: Record<string, string> = {
  cnty: 'County',
  twp: 'Township',
  twnshp: 'Township',
  twsp: 'Township',
  boro: 'Borough',
  vlg: 'Village',
  dist: 'District',
  pct: 'Precinct',
  cncl: 'Council',
  schl: 'School',
  conserv: 'Conservation',
  comm: 'Commissioner',
  sup: 'Supervisorial',
  leg: 'Legislative',
  bd: 'Board',
  wtr: 'Water',
}

// Title-cases the smallest unit (already split on whitespace, '-' and '/').
const titleCasePart = (part: string): string => {
  if (!part) return part
  // Pure number -> drop leading zeros ("02" -> "2", "001" -> "1").
  if (/^\d+$/.test(part)) return String(Number(part))
  const lower = part.toLowerCase()
  if (WORD_REPLACEMENTS[lower]) return WORD_REPLACEMENTS[lower]
  if (ACRONYMS.has(lower)) return part.toUpperCase()
  // Alphanumeric codes (e.g. "NR01") — leave as-is rather than mangle.
  if (/\d/.test(part)) return part
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

// Hyphens and slashes join meaningful sub-tokens ("CNTY-EAST", "COUNTY/OH" and
// compound names like "BOLIVAR-RICHBURG"); title-case each part and preserve
// the separator so compound names stay intact.
const titleCaseToken = (token: string): string =>
  token
    .split('-')
    .map((hyphenPart) =>
      hyphenPart.split('/').map(titleCasePart).join('/'),
    )
    .join('-')

const titleCaseDistrict = (name: string): string =>
  name
    // Drop parenthetical qualifiers: "(EST.)", "(2022)", county context, etc.
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseToken)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

const humanizeDistrictType = (type: string): string =>
  type
    .split('_')
    .filter(Boolean)
    .map(titleCaseToken)
    .join(' ')

/**
 * Formats a raw L2 district name (and optional type) into a human-readable
 * label. Returns null for empty input so callers can fall back to a
 * self-reported district.
 */
export const formatL2DistrictName = (
  rawName?: string | null,
  rawType?: string | null,
): string | null => {
  const name = rawName?.trim()
  if (!name) return null

  // Bare numeric names (legislative districts: "1", "05", "001") are
  // meaningless without the type: + State_House_District -> "State House
  // District 1".
  if (/^\d+$/.test(name) && rawType?.trim()) {
    return `${humanizeDistrictType(rawType)} ${Number(name)}`
  }

  return titleCaseDistrict(name) || name
}
