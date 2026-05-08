/**
 * Derives meeting-pipeline `expected_body` from BallotReady-style Position.name
 * (or organization custom position name).
 *
 * Strategy:
 *   1. Clean the input (strip surrounding quotes, county prefix, qualifier suffixes).
 *   2. Tier 1 — match a known governing-body substring and return its canonical
 *      Title Case form.
 *   3. Police-juror regex (special-case for Louisiana parishes).
 *   4. Tier 2 — match a known role substring and return the body that role
 *      serves on / presides over.
 *   5. Fallback — Title Case the cleaned name.
 */

type Mapping = readonly [substring: string, canonicalBody: string]

/**
 * Single source of truth for canonical Title Case governing-body names. Both
 * the Tier 1 body table and the Tier 2 role table reference these constants so
 * the spelling stays consistent and the strings only appear once each.
 */
const BODIES = {
  CityCouncil: 'City Council',
  TownCouncil: 'Town Council',
  VillageCouncil: 'Village Council',
  BoroughCouncil: 'Borough Council',
  CommonCouncil: 'Common Council',
  MunicipalCouncil: 'Municipal Council',
  TownshipCouncil: 'Township Council',
  AldermanicCouncil: 'Aldermanic Council',
  CountyCouncil: 'County Council',
  CouncilOfTheCity: 'Council of the City',
  CityBoard: 'City Board',
  TownBoard: 'Town Board',
  VillageBoard: 'Village Board',
  TownshipBoard: 'Township Board',
  CountyBoard: 'County Board',
  SchoolBoard: 'School Board',
  LibraryBoard: 'Library Board',
  ParkDistrictBoard: 'Park District Board',
  ParksAndRecreationBoard: 'Parks and Recreation Board',
  FireBoard: 'Fire Board',
  FireProtectionDistrictBoard: 'Fire Protection District Board',
  PublicUtilitiesBoard: 'Public Utilities Board',
  PortBoard: 'Port Board',
  WaterSupplyBoard: 'Water Supply Board',
  CommunityCollegeDistrictBoard: 'Community College District Board',
  MunicipalImprovementDistrictBoard: 'Municipal Improvement District Board',
  MetropolitanExpositionBoard:
    'Metropolitan Exposition and Auditorium Authority Board',
  TownSelectBoard: 'Town Select Board',
  SelectBoard: 'Select Board',
  CityCommission: 'City Commission',
  TownCommission: 'Town Commission',
  VillageCommission: 'Village Commission',
  CountyCommission: 'County Commission',
  CountyLegislature: 'County Legislature',
  BoardOfAldermen: 'Board of Aldermen',
  BoardOfAlderpersons: 'Board of Alderpersons',
  BoardOfMayorAndAldermen: 'Board of Mayor and Aldermen',
  BoardOfSelectmen: 'Board of Selectmen',
  BoardOfTrustees: 'Board of Trustees',
  BoardOfCommissioners: 'Board of Commissioners',
  PoliceJury: 'Police Jury',
} as const

/**
 * Tier 1: Direct governing-body keywords. Sorted longest-first so that more
 * specific bodies win over shorter ones. Output is the canonical Title Case
 * body name; in most rows the substring is identical to the output, but a few
 * rows are aliases (e.g. `'Board of Mayor'` → `'Board of Mayor and Aldermen'`)
 * or normalize to a shorter standardized form (matching the `OfficeType`
 * categorization in `ballotready_standardizations.sql`).
 */
const BODY_KEYWORDS: ReadonlyArray<Mapping> = [
  [BODIES.MetropolitanExpositionBoard, BODIES.MetropolitanExpositionBoard],
  [
    BODIES.MunicipalImprovementDistrictBoard,
    BODIES.MunicipalImprovementDistrictBoard,
  ],
  ['Parks and Recreation District Board', BODIES.ParksAndRecreationBoard],
  [BODIES.CommunityCollegeDistrictBoard, BODIES.CommunityCollegeDistrictBoard],
  [BODIES.FireProtectionDistrictBoard, BODIES.FireProtectionDistrictBoard],
  [BODIES.BoardOfMayorAndAldermen, BODIES.BoardOfMayorAndAldermen],
  ['Library District Board', BODIES.LibraryBoard],
  [BODIES.BoardOfCommissioners, BODIES.BoardOfCommissioners],
  [BODIES.PublicUtilitiesBoard, BODIES.PublicUtilitiesBoard],
  ['Harbor District Board', BODIES.PortBoard],
  ['Water Supply District', BODIES.WaterSupplyBoard],
  [BODIES.BoardOfAlderpersons, BODIES.BoardOfAlderpersons],
  [BODIES.CouncilOfTheCity, BODIES.CouncilOfTheCity],
  [BODIES.ParkDistrictBoard, BODIES.ParkDistrictBoard],
  ['Fire District Board', BODIES.FireBoard],
  ['Port District Board', BODIES.PortBoard],
  [BODIES.AldermanicCouncil, BODIES.AldermanicCouncil],
  [BODIES.BoardOfSelectmen, BODIES.BoardOfSelectmen],
  [BODIES.CountyLegislature, BODIES.CountyLegislature],
  [BODIES.VillageCommission, BODIES.VillageCommission],
  [BODIES.BoardOfAldermen, BODIES.BoardOfAldermen],
  [BODIES.BoardOfTrustees, BODIES.BoardOfTrustees],
  [BODIES.TownSelectBoard, BODIES.TownSelectBoard],
  [BODIES.MunicipalCouncil, BODIES.MunicipalCouncil],
  [BODIES.CountyCommission, BODIES.CountyCommission],
  [BODIES.TownshipCouncil, BODIES.TownshipCouncil],
  [BODIES.BoroughCouncil, BODIES.BoroughCouncil],
  [BODIES.VillageCouncil, BODIES.VillageCouncil],
  [BODIES.CityCommission, BODIES.CityCommission],
  [BODIES.TownCommission, BODIES.TownCommission],
  [BODIES.TownshipBoard, BODIES.TownshipBoard],
  [BODIES.CommonCouncil, BODIES.CommonCouncil],
  [BODIES.CountyCouncil, BODIES.CountyCouncil],
  ['Board of Mayor', BODIES.BoardOfMayorAndAldermen],
  [BODIES.VillageBoard, BODIES.VillageBoard],
  [BODIES.LibraryBoard, BODIES.LibraryBoard],
  [BODIES.CountyBoard, BODIES.CountyBoard],
  [BODIES.CityCouncil, BODIES.CityCouncil],
  [BODIES.TownCouncil, BODIES.TownCouncil],
  [BODIES.SchoolBoard, BODIES.SchoolBoard],
  [BODIES.SelectBoard, BODIES.SelectBoard],
  [BODIES.PoliceJury, BODIES.PoliceJury],
  [BODIES.TownBoard, BODIES.TownBoard],
  [BODIES.CityBoard, BODIES.CityBoard],
]

/**
 * Tier 2: Role names mapped to the body the role serves on / presides over.
 * Used only when no Tier 1 body keyword matches. Sourced from the
 * `generate_candidate_office_from_position` macro in
 * `ballotready_standardizations.sql` plus common variants.
 *
 * Entries are sorted longest-first to ensure more specific roles match before
 * generic ones (e.g. `'Vice Mayor'` before `'Mayor'`, even though both map to
 * the same body).
 */
const ROLE_TO_BODY: ReadonlyArray<Mapping> = [
  ['Township Highway Superintendent', BODIES.TownshipBoard],
  ['Township Constable', BODIES.TownshipBoard],
  ['Township Treasurer', BODIES.TownshipBoard],
  ['Borough President', BODIES.BoroughCouncil],
  ['Village President', BODIES.VillageBoard],
  ['Township Trustee', BODIES.TownshipBoard],
  ['City Comptroller', BODIES.CityCouncil],
  ['Town Supervisor', BODIES.TownBoard],
  ['Township Clerk', BODIES.TownshipBoard],
  ['City Treasurer', BODIES.CityCouncil],
  ['Village Clerk', BODIES.VillageBoard],
  ['City Attorney', BODIES.CityCouncil],
  ['City Assessor', BODIES.CityCouncil],
  ['Selectperson', BODIES.BoardOfSelectmen],
  ['City Auditor', BODIES.CityCouncil],
  ['Selectwoman', BODIES.BoardOfSelectmen],
  ['Alderperson', BODIES.BoardOfAlderpersons],
  ['Alderwoman', BODIES.BoardOfAldermen],
  ['Aldermanic', BODIES.BoardOfAldermen],
  ['Town Chair', BODIES.TownBoard],
  ['Town Clerk', BODIES.TownBoard],
  ['City Clerk', BODIES.CityCouncil],
  ['Vice Mayor', BODIES.CityCouncil],
  ['Selectman', BODIES.BoardOfSelectmen],
  ['Alderman', BODIES.BoardOfAldermen],
  ['Mayor', BODIES.CityCouncil],
]

const TITLE_CASE_SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs',
  'with',
])

function toTitleCase(input: string): string {
  return input
    .split(/(\s+)/)
    .map((token, idx) => {
      if (/^\s+$/.test(token)) return token
      const lower = token.toLowerCase()
      if (idx > 0 && TITLE_CASE_SMALL_WORDS.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join('')
}

function lookup(name: string, table: ReadonlyArray<Mapping>): string | null {
  const lower = name.toLowerCase()
  for (const [kw, canonical] of table) {
    if (lower.includes(kw.toLowerCase())) return canonical
  }
  return null
}

function stripSurroundingQuotes(raw: string): string {
  let s = raw.trim()
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).trim()
  }
  return s
}

/** Strips leading "Foo County: " or "Foo Parish: " (BR convention). */
function stripCountyOrParishPrefix(name: string): string {
  return name.replace(/^[\w\s.'-]+\s+(County|Parish|Borough):\s*/i, '').trim()
}

/** Removes trailing parenthetical e.g. "(Unexpired term)" or "(Retain X?)". */
function stripTrailingParenthetical(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/i, '').trim()
}

/**
 * Strips trailing " - Ward 4", " - District 6", " - Seat B", etc.
 * Runs in a loop to handle chained suffixes.
 */
function stripQualifierSuffixes(name: string): string {
  let s = name.trim()
  const patterns: RegExp[] = [
    /\s+-\s+Ward\s+.+$/i,
    /\s+-\s+District\s+.+$/i,
    /\s+-\s+Seat\s+.+$/i,
    /\s+-\s+Position\s+.+$/i,
    /\s+-\s+Precinct\s+.+$/i,
    /\s+-\s+Area\s+.+$/i,
    /\s+-\s+Region\s+.+$/i,
    /\s+-\s+Zone\s+.+$/i,
    /\s+-\s+Subdistrict\s+.+$/i,
    /\s+-\s+Division\s+.+$/i,
    /\s+-\s+Group\s+.+$/i,
    /\s+-\s+Post\s+.+$/i,
    /\s+-\s+Place\s+.+$/i,
    /\s+-\s+Part\s+.+$/i,
    /\s+-\s+At Large\s*.*$/i,
    /\s+-\s+Unexpired\s+.+$/i,
    /\s+-\s+Retain\s+.+$/i,
    /\s+-\s+Section\s+.+$/i,
    /\s+-\s+Catalpa\s+District\s*.*$/i, // "Culpeper County Board - Catalpa District"
    /\s+-\s+North\s*$/i,
    /\s+-\s+Middle\s+Ward\s*.*$/i,
  ]

  for (let i = 0; i < 8; i++) {
    const before = s
    s = stripTrailingParenthetical(s)
    for (const re of patterns) {
      s = s.replace(re, '').trim()
    }
    if (s === before) break
  }

  // Remaining single " - …" tail (e.g. circuit judge details) — strip once if still long
  const dashIdx = s.indexOf(' - ')
  if (dashIdx > 0 && s.length - dashIdx > 25) {
    s = s.slice(0, dashIdx).trim()
  }

  return s.trim()
}

/**
 * Returns a non-empty Title Case string suitable for manifest `expected_body`.
 */
export function extractBodyFromPositionName(
  positionName: string | null | undefined,
): string {
  const raw = (positionName ?? '').trim()
  if (!raw) return 'Unknown'

  let s = stripSurroundingQuotes(raw)
  s = stripCountyOrParishPrefix(s)
  s = stripQualifierSuffixes(s)

  const bodyMatch = lookup(s, BODY_KEYWORDS)
  if (bodyMatch) return bodyMatch

  if (/\bpolice\s+juror\b/i.test(s)) return 'Police Jury'

  const roleMatch = lookup(s, ROLE_TO_BODY)
  if (roleMatch) return roleMatch

  return toTitleCase(s) || 'Unknown'
}
