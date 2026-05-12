export type DomainPatternContext = {
  firstName: string
  lastName: string
  /**
   * Must be a Date whose UTC components (year/month/day) represent the
   * intended calendar date. The substitution code reads
   * `getUTCFullYear()` / `getUTCMonth()` to render `{yyyy}` / `{mm}` /
   * `{month_abbreviation}`, so a Date constructed in local time would
   * wrap month/year on servers east of UTC. Use
   * `parseIsoDateAsUTC` (in `shared/util/date.util.ts`) to parse
   * 'YYYY-MM-DD' strings safely.
   */
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

export class PatternExpansionLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`pattern expansion exceeded ${limit} candidate(s)`)
    this.name = 'PatternExpansionLimitError'
  }
}

type Budget = { left: number; limit: number }

const consumeOne = (input: string, budget: Budget): string[] => {
  budget.left -= 1
  if (budget.left < 0) {
    throw new PatternExpansionLimitError(budget.limit)
  }
  return [input]
}

const expandAlternations = (input: string, budget: Budget): string[] => {
  // Linear-time scan instead of /\(([^)]+)\)/ — the regex form has
  // O(n^2) backtracking on adversarial inputs like '(((((' (CodeQL ReDoS).
  const open = input.indexOf('(')
  if (open === -1) return consumeOne(input, budget)
  const close = input.indexOf(')', open + 1)
  if (close === -1 || close === open + 1) return consumeOne(input, budget)
  const group = input.slice(open + 1, close)
  // Budget is decremented at each leaf, so the recursion aborts the moment
  // the cap is hit — preventing the cross-product from materializing
  // (e.g. 6 groups of 10 options would otherwise yield 1M intermediate
  // strings before any post-hoc check could fire).
  return group
    .split('|')
    .flatMap((opt) =>
      expandAlternations(
        input.slice(0, open) + opt + input.slice(close + 1),
        budget,
      ),
    )
}

const substituteAndExpand = (
  pattern: string,
  ctx: DomainPatternContext,
  budget: Budget,
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
  if (hasUnresolvedPlaceholder(substituted)) {
    return []
  }
  return expandAlternations(substituted, budget)
}

export const expandDomainPattern = (
  pattern: string,
  ctx: DomainPatternContext,
  options?: { maxCandidates?: number },
): string[] => {
  const limit = options?.maxCandidates ?? Number.POSITIVE_INFINITY
  return substituteAndExpand(pattern, ctx, { left: limit, limit })
}

// Linear-time check for any '{...}' group with ≥1 char inside. Avoids the
// O(n^2) backtracking of /\{[^}]+\}/.test() on adversarial inputs like
// '{{{{{' (CodeQL ReDoS).
const hasUnresolvedPlaceholder = (s: string): boolean => {
  let from = 0
  while (from < s.length) {
    const open = s.indexOf('{', from)
    if (open === -1) return false
    const close = s.indexOf('}', open + 1)
    if (close === -1) return false
    if (close > open + 1) return true
    from = close + 1
  }
  return false
}

/**
 * Invariant: at most `options.maxCandidates` candidate strings are ever
 * materialized in memory across the entire call, regardless of how
 * "explosive" the input patterns are (e.g. `(a|b|...|j){7}` would yield
 * 10^7 candidates uncapped). The shared `Budget` is decremented at every
 * leaf inside `expandAlternations`; the recursion throws
 * `PatternExpansionLimitError` the moment the (limit + 1)-th leaf is
 * about to be emitted, so the cross-product never fully materializes.
 */
export const expandDomainPatterns = (
  patterns: string[],
  ctx: DomainPatternContext,
  options?: { maxCandidates?: number },
): string[] => {
  const limit = options?.maxCandidates ?? Number.POSITIVE_INFINITY
  const budget: Budget = { left: limit, limit }
  const all = patterns.flatMap((p) => substituteAndExpand(p, ctx, budget))
  return Array.from(new Set(all))
}
