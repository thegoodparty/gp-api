/**
 * Derives meeting-pipeline `expected_body` from BallotReady-style Position.name
 * (or organization custom position name). Best-effort; admins can override in UI.
 */

const BODY_KEYWORDS_LONGEST_FIRST = [
  'Fire Protection District Board',
  'Metropolitan Exposition and Auditorium Authority Board',
  'Community College District Board',
  'Municipal Improvement District Board',
  'Public Utilities Board',
  'Park District Board',
  'School Board',
  'County Legislature',
  'County Commission',
  'County Council',
  'County Board',
  'City Council',
  'Town Council',
  'Village Council',
  'Borough Council',
  'Town Select Board',
  'Township Board',
  'Town Board',
  'Village Board',
  'Library Board',
  'Police Jury',
] as const

function stripSurroundingQuotes(raw: string): string {
  let s = raw.trim()
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).trim()
  }
  return s
}

/** Strips leading "Foo County: " or "Foo Parish: " (BR convention). */
function stripCountyOrParishPrefix(name: string): string {
  return name.replace(
    /^[\w\s.'-]+\s+(County|Parish|Borough):\s*/i,
    '',
  ).trim()
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

function findBodyKeyword(name: string): string | null {
  const lower = name.toLowerCase()
  for (const kw of BODY_KEYWORDS_LONGEST_FIRST) {
    const idx = lower.indexOf(kw.toLowerCase())
    if (idx !== -1) {
      return name.slice(idx, idx + kw.length)
    }
  }
  if (/\bpolice\s+juror\b/i.test(name)) {
    return 'Police Jury'
  }
  return null
}

/**
 * Returns a non-empty string suitable for manifest `expected_body`.
 */
export function extractBodyFromPositionName(positionName: string | null | undefined): string {
  const raw = (positionName ?? '').trim()
  if (!raw) {
    return 'Unknown'
  }

  let s = stripSurroundingQuotes(raw)
  s = stripCountyOrParishPrefix(s)
  s = stripQualifierSuffixes(s)

  const keywordMatch = findBodyKeyword(s)
  if (keywordMatch) {
    return keywordMatch
  }

  if (!s) {
    return stripSurroundingQuotes(raw).trim() || 'Unknown'
  }

  return s
}
