import { z } from 'zod'
import type { LlmStreamTool } from '@/llm/services/llm.service'
import type { DatabricksProvider } from './queryDatabricks.tool'
import { isRecord } from './util/isRecord.util'
import { parseSingleSelect } from './util/sqlAst.util'

export class SqlRejected extends Error {
  constructor(reason: string) {
    super(`SQL rejected: ${reason}`)
    this.name = 'SqlRejected'
  }
}

const WRITE_AST_TYPES = new Set([
  'insert',
  'update',
  'delete',
  'replace',
  'truncate',
  'create',
  'alter',
  'drop',
  'rename',
  'grant',
  'revoke',
  'copy',
  'call',
  'use',
  'set',
  'lock',
  'unlock',
  'execute',
  'merge',
])

const INVISIBLE_CHARS = new RegExp(
  '[' + '\\uFEFF' + '\\u200B' + '\\u200C' + '\\u200D' + '\\u2060' + ']',
)

const containsWriteNode = (node: unknown): boolean => {
  if (node === null || node === undefined) return false
  if (Array.isArray(node)) {
    return node.some(containsWriteNode)
  }
  if (!isRecord(node)) return false
  const t = node.type
  if (typeof t === 'string' && WRITE_AST_TYPES.has(t.toLowerCase())) {
    return true
  }
  for (const key of Object.keys(node)) {
    if (containsWriteNode(node[key])) return true
  }
  return false
}

export interface MandatoryFilter {
  column: string
  value: string
}

export interface ValidateInsightsSqlOptions {
  allowedTables: Set<string>
  // Every filter listed here MUST be guaranteed across every result row.
  // I.e., each filter's column must equal its value via a mandatory AND-chain
  // predicate. OR-branches that don't preserve the equality break the
  // guarantee and the query is rejected. Typical use: lock the L2 district
  // type column to the user's district AND lock state_postal_code to the
  // user's state.
  mandatoryFilters: MandatoryFilter[]
}

const stripQuotes = (s: string): string =>
  s.replace(/^[`"']/, '').replace(/[`"']$/, '')

const collectTableRefs = (node: unknown, acc: Set<string>): void => {
  if (!node) return
  if (Array.isArray(node)) {
    for (const item of node) collectTableRefs(item, acc)
    return
  }
  if (!isRecord(node)) return

  // Common shape: { table: 'x' } from FROM/JOIN entries
  const table = node.table
  if (typeof table === 'string' && table.length > 0) {
    acc.add(stripQuotes(table))
  }

  for (const key of Object.keys(node)) {
    if (key === 'table') continue
    collectTableRefs(node[key], acc)
  }
}

const selectListIsAllAggregateOrLiteral = (columns: unknown): boolean => {
  if (!Array.isArray(columns)) return false
  return columns.every((col) => {
    if (!isRecord(col)) return false
    const expr = col.expr
    if (!isRecord(expr)) return false
    if (expr.type === 'aggr_func') return true
    if (expr.type === 'number' || expr.type === 'string') return true
    return false
  })
}

const extractStringLiteral = (node: unknown): string | null => {
  if (!isRecord(node)) return null
  if (node.type === 'string' && typeof node.value === 'string')
    return node.value
  if (node.type === 'single_quote_string' && typeof node.value === 'string')
    return node.value
  return null
}

const extractColumnRef = (node: unknown): string | null => {
  if (!isRecord(node)) return null
  if (node.type !== 'column_ref') return null
  const col = node.column
  if (typeof col === 'string') return col
  if (isRecord(col) && isRecord(col.expr)) {
    const ex = col.expr
    if (typeof ex.value === 'string') return ex.value
  }
  return null
}

/**
 * Walks a WHERE-expression AST and returns the set of values that are
 * guaranteed to equal `column` on EVERY satisfying row (i.e. mandatory
 * AND-chain equality predicates against `column`).
 *
 * - AND node: union of both sides' mandatory sets.
 * - OR node: intersection — only values guaranteed by BOTH branches are
 *   mandatory. This rejects "col = X OR col = Y" (mandatory set is empty
 *   because neither value alone is guaranteed) and "col = X OR 1=1"
 *   (right side has nothing, so intersection is empty).
 * - `col = literal` matching the target column: returns { literal }.
 * - Anything else (functions, type coercions, comparisons against other
 *   columns): empty set.
 */
const mandatoryValuesForColumn = (
  where: unknown,
  column: string,
): Set<string> => {
  if (!isRecord(where)) return new Set()
  const type = where.type

  if (type === 'binary_expr') {
    const op =
      typeof where.operator === 'string' ? where.operator.toUpperCase() : ''
    const left = where.left
    const right = where.right

    if (op === 'AND') {
      const a = mandatoryValuesForColumn(left, column)
      const b = mandatoryValuesForColumn(right, column)
      return new Set([...a, ...b])
    }
    if (op === 'OR') {
      const a = mandatoryValuesForColumn(left, column)
      const b = mandatoryValuesForColumn(right, column)
      const intersect = new Set<string>()
      for (const v of a) if (b.has(v)) intersect.add(v)
      return intersect
    }
    if (op === '=') {
      const colName = extractColumnRef(left) ?? extractColumnRef(right)
      if (colName !== column) return new Set()
      const value = extractStringLiteral(right) ?? extractStringLiteral(left)
      if (value === null) return new Set()
      return new Set([value])
    }
    return new Set()
  }

  return new Set()
}

export const validateInsightsSql = (
  sql: string,
  opts: ValidateInsightsSqlOptions,
): string => {
  if (INVISIBLE_CHARS.test(sql)) {
    throw new SqlRejected('invisible / zero-width characters are not allowed')
  }
  const parsed = parseSingleSelect(sql)
  if (!parsed) {
    throw new SqlRejected(
      'only a single SELECT statement is allowed (unparseable, multi-statement, or non-SELECT)',
    )
  }
  const stmt = parsed.stmt

  if (containsWriteNode(stmt)) {
    throw new SqlRejected(
      'write operations (INSERT/UPDATE/DELETE/DDL) are not allowed, even nested in CTEs or subqueries',
    )
  }

  // Table allowlist — every table referenced anywhere in the AST must be in
  // the allowlist. We walk recursively so JOINs, CTEs, and subqueries are
  // covered too.
  const referenced = new Set<string>()
  collectTableRefs(stmt, referenced)
  if (referenced.size === 0) {
    throw new SqlRejected('no table referenced')
  }
  for (const table of referenced) {
    if (!opts.allowedTables.has(table)) {
      throw new SqlRejected(`table not in allowlist: ${table}`)
    }
  }

  // Aggregate-only shape: must have GROUP BY OR every selected expression
  // must be an aggregate function (or literal).
  const hasGroupBy = stmt.groupby !== null && stmt.groupby !== undefined
  if (!hasGroupBy) {
    if (!selectListIsAllAggregateOrLiteral(stmt.columns)) {
      throw new SqlRejected(
        'query must use GROUP BY or be a pure aggregate (e.g. COUNT(*))',
      )
    }
  }

  // Every mandatory filter must be guaranteed across every result row.
  // The mandatory-set walker handles AND/OR correctly: an OR that doesn't
  // preserve the equality on both sides breaks the guarantee.
  for (const filter of opts.mandatoryFilters) {
    const got = mandatoryValuesForColumn(stmt.where, filter.column)
    if (!got.has(filter.value)) {
      throw new SqlRejected(
        `query must guarantee ${filter.column} = '${filter.value}' (no OR / no leak)`,
      )
    }
  }

  // Return the original SQL string. node-sql-parser's sqlify() re-emits in
  // PostgreSQL dialect (double-quoted identifiers), but Databricks runs Spark
  // SQL where double-quoted identifiers are a parse error. Since we've
  // validated the AST is safe, the original SQL is fine to pass through.
  return sql
}

export interface ScrubOptions {
  minCellSize: number
  countColumnAliases?: string[]
}

export interface ScrubResult {
  kept: Array<Record<string, unknown>>
  suppressed: number
  reason: 'cell_size' | 'no_count_column' | null
}

const DEFAULT_COUNT_ALIASES = ['count', 'n', 'voters', 'total', 'count_voters']

const findCountKey = (
  row: Record<string, unknown>,
  aliases: string[],
): string | null => {
  const keys = Object.keys(row)
  const lowerToActual = new Map<string, string>()
  for (const k of keys) lowerToActual.set(k.toLowerCase(), k)
  for (const alias of aliases) {
    const actual = lowerToActual.get(alias.toLowerCase())
    if (actual !== undefined) return actual
  }
  return null
}

// BigInt -> Number loses precision for values > 2^53; cell-size thresholds are
// small enough that this is safe in practice.
const coerceToNumber = (v: unknown): number => {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

export const scrubResults = (
  rows: Array<Record<string, unknown>>,
  opts: ScrubOptions,
): ScrubResult => {
  if (rows.length === 0) {
    return { kept: [], suppressed: 0, reason: null }
  }

  const aliases = [...(opts.countColumnAliases ?? []), ...DEFAULT_COUNT_ALIASES]
  const countKey = findCountKey(rows[0], aliases)

  if (countKey === null) {
    return { kept: rows, suppressed: 0, reason: 'no_count_column' }
  }

  const kept: Array<Record<string, unknown>> = []
  let suppressed = 0
  for (const row of rows) {
    const value = coerceToNumber(row[countKey])
    if (value >= opts.minCellSize) {
      kept.push(row)
    } else {
      suppressed += 1
    }
  }

  return {
    kept,
    suppressed,
    reason: suppressed > 0 ? 'cell_size' : null,
  }
}

export interface DistrictInsightsInput {
  sql: string
  rationale: string
}

export interface DistrictInsightsOutput {
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowsReturned: number
  rowsSuppressed: number
}

export interface BuildDistrictInsightsToolDeps {
  provider: DatabricksProvider
  allowedTables: Set<string>
  mandatoryFilters: MandatoryFilter[]
  minCellSize?: number
}

const DEFAULT_MIN_CELL_SIZE = 100

const buildDescription = (
  allowedTables: Set<string>,
  mandatoryFilters: MandatoryFilter[],
): string => {
  const tableName = [...allowedTables][0] ?? '<table>'
  const whereClause = mandatoryFilters
    .map((f) => `${f.column} = '${f.value}'`)
    .join(' AND ')

  return `Query aggregate constituent data for YOUR district. Use this for questions about how your constituents feel on issues, demographic composition, turnout propensity.

Table: ${tableName} (one row per registered voter, joined with Haystaq modeled scores; 200+ hs_* scored columns)

Required WHERE clause (your district scope, copy verbatim):
  WHERE ${whereClause}

CALL list_district_topics FIRST to discover the relevant hs_* columns for the user's question — don't guess column names. The catalog covers housing, taxes, education, healthcare, climate, immigration, crime, social issues, regulation, turnout, engagement, political identity, trust, media, and demographic grouping dimensions.

REQUIREMENTS:
  - Single SELECT statement only.
  - Must include GROUP BY (or be a pure aggregate like COUNT(*) / AVG(...)).
  - Must include the WHERE clause above verbatim — AND-combined with any extra filters.
  - Rows with COUNT(*) < ${DEFAULT_MIN_CELL_SIZE} are suppressed automatically.

INPUT:
  - sql: the full SELECT statement
  - rationale: one sentence explaining why this query answers the user's question

When the tool returns, surface findings to the user in PLAIN LANGUAGE — percentages and counts, not raw decimal scores. Never echo the SQL or the column names.`
}

const districtInsightsInputSchema = z.object({
  sql: z.string().min(1),
  rationale: z.string().min(1),
})

export const buildDistrictInsightsTool = (
  deps: BuildDistrictInsightsToolDeps,
): LlmStreamTool<DistrictInsightsInput, DistrictInsightsOutput> => ({
  description: buildDescription(deps.allowedTables, deps.mandatoryFilters),
  inputSchema: districtInsightsInputSchema,
  execute: async ({ sql }) => {
    const validatedSql = validateInsightsSql(sql, {
      allowedTables: deps.allowedTables,
      mandatoryFilters: deps.mandatoryFilters,
    })

    const result = await deps.provider.query(validatedSql)
    const scrubbed = scrubResults(result.rows, {
      minCellSize: deps.minCellSize ?? DEFAULT_MIN_CELL_SIZE,
    })

    return {
      columns: result.columns,
      rows: scrubbed.kept,
      rowsReturned: scrubbed.kept.length,
      rowsSuppressed: scrubbed.suppressed,
    }
  },
})
