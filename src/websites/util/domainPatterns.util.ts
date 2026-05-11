export type DomainPatternContext = {
  firstName: string
  lastName: string
  electionDate: Date
}

export const normalizeName = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '')

const MONTH_ABBREVIATIONS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

const buildSubstitutions = (
  ctx: DomainPatternContext,
): Record<string, string> => {
  const normalizedLast = normalizeName(ctx.lastName)
  const normalizedFirst = normalizeName(ctx.firstName)
  // Election dates are stored as ISO date-only strings (UTC midnight). Use
  // UTC getters here so the rendered domain is independent of server TZ —
  // date-fns `format` defaults to local TZ and would render Nov 3 UTC as
  // Nov 2 in any TZ west of UTC.
  const monthIndex = ctx.electionDate.getUTCMonth()
  return {
    last_name: normalizedLast,
    first_initial: normalizedFirst.charAt(0),
    last_initial: normalizedLast.charAt(0),
    mm: String(monthIndex + 1).padStart(2, '0'),
    yyyy: String(ctx.electionDate.getUTCFullYear()),
    month_abbreviation: MONTH_ABBREVIATIONS[monthIndex],
  }
}

const expandAlternations = (input: string): string[] => {
  const match = input.match(/\(([^)]+)\)/)
  if (!match) return [input]
  const [whole, group] = match
  return group
    .split('|')
    .flatMap((opt) => expandAlternations(input.replace(whole, opt)))
}

export const expandDomainPattern = (
  pattern: string,
  ctx: DomainPatternContext,
): string[] => {
  const subs = buildSubstitutions(ctx)
  let substituted = pattern
  for (const m of pattern.matchAll(/\{([a-z_]+)\}/g)) {
    const value = subs[m[1]]
    if (value === undefined || value === '') {
      return []
    }
    substituted = substituted.replace(m[0], value)
  }
  if (/\{[^}]+\}/.test(substituted)) {
    return []
  }
  return expandAlternations(substituted)
}

export const expandDomainPatterns = (
  patterns: string[],
  ctx: DomainPatternContext,
): string[] => {
  const all = patterns.flatMap((p) => expandDomainPattern(p, ctx))
  return Array.from(new Set(all))
}
