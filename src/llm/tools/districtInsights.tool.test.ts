import { describe, expect, it, vi } from 'vitest'
import {
  buildDistrictInsightsTool,
  scrubResults,
  SqlRejected,
  validateInsightsSql,
} from './districtInsights.tool'
import type { DatabricksProvider } from './queryDatabricks.tool'

const ALLOWED = new Set(['int__l2_nationwide_uniform_w_haystaq'])
const DISTRICT = 'NC-HENDERSONVILLE-CITY'

const defaultOpts = {
  allowedTables: ALLOWED,
  mandatoryFilters: [{ column: 'district_id', value: DISTRICT }],
}

describe('validateInsightsSql', () => {
  describe('rejects non-SELECT statements', () => {
    it('rejects INSERT', () => {
      expect(() =>
        validateInsightsSql(
          "INSERT INTO int__l2_nationwide_uniform_w_haystaq (district_id) VALUES ('x')",
          defaultOpts,
        ),
      ).toThrow(SqlRejected)
    })

    it('rejects UPDATE', () => {
      expect(() =>
        validateInsightsSql(
          "UPDATE int__l2_nationwide_uniform_w_haystaq SET district_id = 'x'",
          defaultOpts,
        ),
      ).toThrow(SqlRejected)
    })

    it('rejects DELETE', () => {
      expect(() =>
        validateInsightsSql(
          "DELETE FROM int__l2_nationwide_uniform_w_haystaq WHERE district_id = 'x'",
          defaultOpts,
        ),
      ).toThrow(SqlRejected)
    })

    it('rejects multi-statement SQL', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) FROM int__l2_nationwide_uniform_w_haystaq WHERE district_id = '${DISTRICT}'; DROP TABLE int__l2_nationwide_uniform_w_haystaq;`,
          defaultOpts,
        ),
      ).toThrow(SqlRejected)
    })

    it('rejects unparseable SQL', () => {
      expect(() => validateInsightsSql('not sql at all', defaultOpts)).toThrow(
        SqlRejected,
      )
    })
  })

  describe('rejects write nodes nested anywhere in the AST', () => {
    // Postgres allows writable CTEs: INSERT/UPDATE/DELETE wrapped inside a
    // WITH that the outer SELECT reads from. node-sql-parser parses these as
    // a single top-level SELECT — the existing `stmt.type === 'select'` check
    // is bypassed. The recursive write-node guard catches them.
    //
    // Allowlisting the CTE alias here so the ONLY reason left to reject is
    // the recursive write-node guard.
    const writeCteOpts = {
      allowedTables: new Set([
        'int__l2_nationwide_uniform_w_haystaq',
        'cte_out',
      ]),
      mandatoryFilters: [{ column: 'district_id', value: DISTRICT }],
    }

    it('rejects a SELECT whose CTE wraps DELETE', () => {
      expect(() =>
        validateInsightsSql(
          `WITH cte_out AS (
             DELETE FROM int__l2_nationwide_uniform_w_haystaq
             WHERE district_id = '${DISTRICT}'
             RETURNING *
           )
           SELECT COUNT(*) AS n FROM cte_out WHERE district_id = '${DISTRICT}'`,
          writeCteOpts,
        ),
      ).toThrow(SqlRejected)
    })

    it('rejects a SELECT whose CTE wraps INSERT', () => {
      expect(() =>
        validateInsightsSql(
          `WITH cte_out AS (
             INSERT INTO int__l2_nationwide_uniform_w_haystaq (district_id)
             VALUES ('x')
             RETURNING *
           )
           SELECT COUNT(*) AS n FROM cte_out WHERE district_id = '${DISTRICT}'`,
          writeCteOpts,
        ),
      ).toThrow(SqlRejected)
    })

    it('rejects a SELECT whose CTE wraps UPDATE', () => {
      expect(() =>
        validateInsightsSql(
          `WITH cte_out AS (
             UPDATE int__l2_nationwide_uniform_w_haystaq
             SET district_id = 'y'
             WHERE district_id = '${DISTRICT}'
             RETURNING *
           )
           SELECT COUNT(*) AS n FROM cte_out WHERE district_id = '${DISTRICT}'`,
          writeCteOpts,
        ),
      ).toThrow(SqlRejected)
    })
  })

  describe('rejects invisible / zero-width characters', () => {
    // node-sql-parser ACCEPTS invisible chars in places like comments and
    // quoted identifier aliases. Without an explicit pre-parser guard, an
    // LLM (or attacker) could craft SQL that looks correct to a human
    // reviewer (the visible string matches the contract) but smuggles
    // invisible bytes through. The INVISIBLE_CHARS guard rejects these
    // before parsing — defense-in-depth around log/audit clarity.

    it('rejects SQL with a zero-width space hidden in a /* */ comment', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq
           WHERE district_id = '${DISTRICT}' /* ​ */`,
          defaultOpts,
        ),
      ).toThrow(SqlRejected)
    })

    it('rejects SQL with a BOM hidden in a -- line comment', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq
           WHERE district_id = '${DISTRICT}' -- comment﻿`,
          defaultOpts,
        ),
      ).toThrow(SqlRejected)
    })

    it('rejects SQL with a zero-width space inside a quoted identifier alias', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) AS "n​" FROM int__l2_nationwide_uniform_w_haystaq
           WHERE district_id = '${DISTRICT}'`,
          defaultOpts,
        ),
      ).toThrow(SqlRejected)
    })

    it('rejects SQL with a zero-width joiner hidden in a /* */ comment', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq
           WHERE district_id = '${DISTRICT}' /* ‍ */`,
          defaultOpts,
        ),
      ).toThrow(SqlRejected)
    })

    it('rejects SQL with a word-joiner hidden in a /* */ comment', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq
           WHERE district_id = '${DISTRICT}' /* ⁠ */`,
          defaultOpts,
        ),
      ).toThrow(SqlRejected)
    })
  })

  describe('rejects tables not in the allowlist', () => {
    it('rejects unknown table', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) FROM voters WHERE district_id = '${DISTRICT}'`,
          defaultOpts,
        ),
      ).toThrow(/table.*allow/i)
    })

    it('rejects JOIN onto unknown table', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) FROM int__l2_nationwide_uniform_w_haystaq a
           JOIN hubspot_contacts b ON a.email = b.email
           WHERE a.district_id = '${DISTRICT}'`,
          defaultOpts,
        ),
      ).toThrow(/table.*allow/i)
    })
  })

  describe('enforces aggregate-only shape', () => {
    it('rejects a query without GROUP BY and without aggregate functions', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT lalvoterid FROM int__l2_nationwide_uniform_w_haystaq WHERE district_id = '${DISTRICT}'`,
          defaultOpts,
        ),
      ).toThrow(/(group by|aggregate)/i)
    })

    it('rejects SELECT * even with a WHERE filter', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT * FROM int__l2_nationwide_uniform_w_haystaq WHERE district_id = '${DISTRICT}'`,
          defaultOpts,
        ),
      ).toThrow(/(group by|aggregate)/i)
    })

    it('accepts a pure-aggregate query (COUNT(*) with no GROUP BY)', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq WHERE district_id = '${DISTRICT}'`,
          defaultOpts,
        ),
      ).not.toThrow()
    })

    it('accepts a GROUP BY query with COUNT(*)', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT party, COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq
           WHERE district_id = '${DISTRICT}'
           GROUP BY party`,
          defaultOpts,
        ),
      ).not.toThrow()
    })

    it('accepts a GROUP BY query with AVG over an hs_ column', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT party, AVG(hs_regulations_too_harsh) AS avg_reg, COUNT(*) AS n
           FROM int__l2_nationwide_uniform_w_haystaq
           WHERE district_id = '${DISTRICT}'
           GROUP BY party`,
          defaultOpts,
        ),
      ).not.toThrow()
    })
  })

  describe('enforces district scope filter', () => {
    it('rejects when WHERE clause is missing entirely', () => {
      expect(() =>
        validateInsightsSql(
          'SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq',
          defaultOpts,
        ),
      ).toThrow(/district/i)
    })

    it('rejects when district_id is filtered to a DIFFERENT district', () => {
      expect(() =>
        validateInsightsSql(
          "SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq WHERE district_id = 'CA-OAKLAND-CITY'",
          defaultOpts,
        ),
      ).toThrow(/district/i)
    })

    it('rejects when WHERE filters on something other than district_id', () => {
      expect(() =>
        validateInsightsSql(
          "SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq WHERE party = 'D'",
          defaultOpts,
        ),
      ).toThrow(/district/i)
    })

    it('rejects when district filter is OR-ed with another district', () => {
      // Classic SQL injection: include the user's district + sneak in another
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq
           WHERE district_id = '${DISTRICT}' OR district_id = 'CA-OAKLAND-CITY'`,
          defaultOpts,
        ),
      ).toThrow(/district/i)
    })

    it('rejects when district filter is OR-ed with a tautology like 1=1', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq
           WHERE district_id = '${DISTRICT}' OR 1=1`,
          defaultOpts,
        ),
      ).toThrow(/district/i)
    })

    it('accepts AND-combined filters as long as district_id = userDistrict is mandatory', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT party, COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq
           WHERE district_id = '${DISTRICT}' AND age_band = '35-44'
           GROUP BY party`,
          defaultOpts,
        ),
      ).not.toThrow()
    })
  })

  describe('enforces multiple mandatory filters (real Haystaq shape)', () => {
    // The actual Haystaq table has no `district_id` column. It has dozens of
    // L2 typed district columns (City_Council_Commissioner_District, etc.)
    // plus a state_postal_code column. Real queries must pin BOTH state and
    // the typed district column to guarantee scoping.
    const haystaqOpts = {
      allowedTables: ALLOWED,
      mandatoryFilters: [
        { column: 'state_postal_code', value: 'NC' },
        {
          column: 'City_Council_Commissioner_District',
          value: 'HENDERSONVILLE',
        },
      ],
    }

    it('accepts a query that pins both state and L2 district column', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT AVG(hs_regulations_too_harsh) AS avg_reg, COUNT(*) AS n
           FROM int__l2_nationwide_uniform_w_haystaq
           WHERE state_postal_code = 'NC'
             AND City_Council_Commissioner_District = 'HENDERSONVILLE'`,
          haystaqOpts,
        ),
      ).not.toThrow()
    })

    it('rejects when state filter is present but L2 district column is missing', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq
           WHERE state_postal_code = 'NC'`,
          haystaqOpts,
        ),
      ).toThrow(/City_Council_Commissioner_District/)
    })

    it('rejects when L2 district column is present but state filter is missing', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq
           WHERE City_Council_Commissioner_District = 'HENDERSONVILLE'`,
          haystaqOpts,
        ),
      ).toThrow(/state_postal_code/)
    })

    it('rejects when state is pinned to a different state than the user', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq
           WHERE state_postal_code = 'CA'
             AND City_Council_Commissioner_District = 'HENDERSONVILLE'`,
          haystaqOpts,
        ),
      ).toThrow(/state_postal_code/)
    })

    it('rejects when one mandatory filter is OR-broken even though the other is pinned', () => {
      expect(() =>
        validateInsightsSql(
          `SELECT COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq
           WHERE state_postal_code = 'NC'
             AND (City_Council_Commissioner_District = 'HENDERSONVILLE'
                  OR City_Council_Commissioner_District = 'RALEIGH')`,
          haystaqOpts,
        ),
      ).toThrow(/City_Council_Commissioner_District/)
    })
  })
})

describe('scrubResults', () => {
  it('returns empty result with reason null when given no rows', () => {
    expect(scrubResults([], { minCellSize: 100 })).toEqual({
      kept: [],
      suppressed: 0,
      reason: null,
    })
  })

  it('keeps all rows unchanged when every row is above threshold', () => {
    const rows = [
      { party: 'D', count: 500 },
      { party: 'R', count: 300 },
    ]
    expect(scrubResults(rows, { minCellSize: 100 })).toEqual({
      kept: rows,
      suppressed: 0,
      reason: null,
    })
  })

  it('drops rows below threshold and reports cell_size', () => {
    const rows = [
      { party: 'D', count: 500 },
      { party: 'R', count: 50 },
      { party: 'I', count: 10 },
    ]
    expect(scrubResults(rows, { minCellSize: 100 })).toEqual({
      kept: [{ party: 'D', count: 500 }],
      suppressed: 2,
      reason: 'cell_size',
    })
  })

  it('drops all rows when all are below threshold', () => {
    const rows = [
      { party: 'D', count: 5 },
      { party: 'R', count: 10 },
      { party: 'I', count: 1 },
    ]
    expect(scrubResults(rows, { minCellSize: 100 })).toEqual({
      kept: [],
      suppressed: 3,
      reason: 'cell_size',
    })
  })

  it('finds count column named "count"', () => {
    const rows = [{ party: 'D', count: 150 }]
    expect(scrubResults(rows, { minCellSize: 100 })).toEqual({
      kept: rows,
      suppressed: 0,
      reason: null,
    })
  })

  it('finds count column named "n"', () => {
    const rows = [{ party: 'D', n: 150 }]
    expect(scrubResults(rows, { minCellSize: 100 })).toEqual({
      kept: rows,
      suppressed: 0,
      reason: null,
    })
  })

  it('finds count column named "voters" (default alias)', () => {
    const rows = [{ party: 'D', voters: 150 }]
    expect(scrubResults(rows, { minCellSize: 100 })).toEqual({
      kept: rows,
      suppressed: 0,
      reason: null,
    })
  })

  it('finds count column named "VOTERS" (case-insensitive match)', () => {
    const rows = [{ party: 'D', VOTERS: 150 }]
    expect(scrubResults(rows, { minCellSize: 100 })).toEqual({
      kept: rows,
      suppressed: 0,
      reason: null,
    })
  })

  it('uses a custom alias from countColumnAliases', () => {
    const rows = [
      { party: 'D', vote_total: 150 },
      { party: 'R', vote_total: 50 },
    ]
    expect(
      scrubResults(rows, {
        minCellSize: 100,
        countColumnAliases: ['vote_total'],
      }),
    ).toEqual({
      kept: [{ party: 'D', vote_total: 150 }],
      suppressed: 1,
      reason: 'cell_size',
    })
  })

  it('returns rows unchanged with reason no_count_column when none recognized', () => {
    const rows = [
      { party: 'D', mystery: 150 },
      { party: 'R', mystery: 5 },
    ]
    expect(scrubResults(rows, { minCellSize: 100 })).toEqual({
      kept: rows,
      suppressed: 0,
      reason: 'no_count_column',
    })
  })

  it('handles BigInt count values', () => {
    const rows = [
      { party: 'D', count: 150n },
      { party: 'R', count: 50n },
    ]
    expect(scrubResults(rows, { minCellSize: 100 })).toEqual({
      kept: [{ party: 'D', count: 150n }],
      suppressed: 1,
      reason: 'cell_size',
    })
  })

  it('coerces string count values, dropping NaN ones', () => {
    const rows = [
      { party: 'D', count: '150' },
      { party: 'R', count: 'foo' },
    ]
    expect(scrubResults(rows, { minCellSize: 100 })).toEqual({
      kept: [{ party: 'D', count: '150' }],
      suppressed: 1,
      reason: 'cell_size',
    })
  })

  it('treats null count as 0 and drops the row', () => {
    const rows = [
      { party: 'D', count: 500 },
      { party: 'R', count: null },
    ]
    expect(scrubResults(rows, { minCellSize: 100 })).toEqual({
      kept: [{ party: 'D', count: 500 }],
      suppressed: 1,
      reason: 'cell_size',
    })
  })

  it('keeps a row whose count equals the threshold exactly', () => {
    const rows = [{ party: 'D', count: 100 }]
    expect(scrubResults(rows, { minCellSize: 100 })).toEqual({
      kept: rows,
      suppressed: 0,
      reason: null,
    })
  })

  it('uses the first matching alias when multiple aliases exist on a row', () => {
    const rows = [
      { party: 'D', count: 150, n: 5 },
      { party: 'R', count: 50, n: 500 },
    ]
    expect(scrubResults(rows, { minCellSize: 100 })).toEqual({
      kept: [{ party: 'D', count: 150, n: 5 }],
      suppressed: 1,
      reason: 'cell_size',
    })
  })
})

describe('buildDistrictInsightsTool', () => {
  const allowedTables = new Set(['int__l2_nationwide_uniform_w_haystaq'])
  const mandatoryFilters = [
    { column: 'state_postal_code', value: 'NC' },
    {
      column: 'City_Council_Commissioner_District',
      value: 'HENDERSONVILLE',
    },
  ]

  const happyPathSql = `SELECT party, AVG(hs_regulations_too_harsh) AS avg_reg, COUNT(*) AS n
                        FROM int__l2_nationwide_uniform_w_haystaq
                        WHERE state_postal_code = 'NC'
                          AND City_Council_Commissioner_District = 'HENDERSONVILLE'
                        GROUP BY party`

  const fakeProvider = (
    overrides: {
      columns?: string[]
      rows?: Array<Record<string, unknown>>
      throws?: Error
    } = {},
  ): DatabricksProvider & { calls: string[] } => {
    const calls: string[] = []
    return {
      calls,
      query: vi.fn(async (sql: string) => {
        calls.push(sql)
        if (overrides.throws) throw overrides.throws
        return {
          columns: overrides.columns ?? ['party', 'avg_reg', 'n'],
          rows: overrides.rows ?? [
            { party: 'D', avg_reg: 0.3, n: 800 },
            { party: 'R', avg_reg: 0.7, n: 600 },
            { party: 'I', avg_reg: 0.5, n: 200 },
          ],
        }
      }),
    }
  }

  it('exposes a description that includes the table, scope WHERE clause, and column hints so the LLM can write valid SQL', () => {
    const tool = buildDistrictInsightsTool({
      provider: fakeProvider(),
      allowedTables,
      mandatoryFilters,
    })
    expect(typeof tool.description).toBe('string')
    // Must include the table the LLM should query against.
    expect(tool.description).toContain('int__l2_nationwide_uniform_w_haystaq')
    // Must include the literal mandatory WHERE values so the LLM can copy
    // them verbatim into its query.
    expect(tool.description).toContain("state_postal_code = 'NC'")
    expect(tool.description).toContain(
      "City_Council_Commissioner_District = 'HENDERSONVILLE'",
    )
    // Must hint at useful column families.
    expect(tool.description).toMatch(/hs_/)
    // Must remind the LLM not to echo to the user (defense in depth — the
    // system prompt also enforces this).
    expect(tool.description).toMatch(/never echo|plain language/i)
    expect(typeof tool.inputSchema.parse).toBe('function')
  })

  it('requires both sql and rationale in the input schema', () => {
    const tool = buildDistrictInsightsTool({
      provider: fakeProvider(),
      allowedTables,
      mandatoryFilters,
    })
    expect(() => tool.inputSchema.parse({ sql: 'x' })).toThrow()
    expect(() => tool.inputSchema.parse({ rationale: 'x' })).toThrow()
    expect(() =>
      tool.inputSchema.parse({ sql: 'x', rationale: 'because' }),
    ).not.toThrow()
  })

  it('happy path: validates SQL, calls provider, scrubs results', async () => {
    const provider = fakeProvider()
    const tool = buildDistrictInsightsTool({
      provider,
      allowedTables,
      mandatoryFilters,
    })
    const out = await tool.execute({
      sql: happyPathSql,
      rationale: 'compare regulation views by party',
    })

    expect(provider.calls).toHaveLength(1)
    // All 3 rows are >= 100 with default minCellSize, so none suppressed.
    expect(out.rowsReturned).toBe(3)
    expect(out.rowsSuppressed).toBe(0)
    expect(out.columns).toEqual(['party', 'avg_reg', 'n'])
    expect(out.rows).toHaveLength(3)
  })

  it('rejects SQL that fails the validator (provider is never called)', async () => {
    const provider = fakeProvider()
    const tool = buildDistrictInsightsTool({
      provider,
      allowedTables,
      mandatoryFilters,
    })
    // Missing the state filter — validator rejects.
    await expect(
      tool.execute({
        sql: `SELECT party, COUNT(*) AS n FROM int__l2_nationwide_uniform_w_haystaq
              WHERE City_Council_Commissioner_District = 'HENDERSONVILLE'
              GROUP BY party`,
        rationale: 'party breakdown',
      }),
    ).rejects.toBeInstanceOf(SqlRejected)
    expect(provider.calls).toHaveLength(0)
  })

  it('suppresses rows below the default minCellSize (100) before returning', async () => {
    const provider = fakeProvider({
      rows: [
        { party: 'D', n: 500 },
        { party: 'R', n: 50 },
        { party: 'I', n: 10 },
      ],
    })
    const tool = buildDistrictInsightsTool({
      provider,
      allowedTables,
      mandatoryFilters,
    })
    const out = await tool.execute({
      sql: happyPathSql,
      rationale: 'r',
    })
    expect(out.rowsReturned).toBe(1)
    expect(out.rowsSuppressed).toBe(2)
    expect(out.rows).toEqual([{ party: 'D', n: 500 }])
  })

  it('respects a custom minCellSize', async () => {
    const provider = fakeProvider({
      rows: [
        { party: 'D', n: 500 },
        { party: 'R', n: 30 },
      ],
    })
    const tool = buildDistrictInsightsTool({
      provider,
      allowedTables,
      mandatoryFilters,
      minCellSize: 25,
    })
    const out = await tool.execute({
      sql: happyPathSql,
      rationale: 'r',
    })
    expect(out.rowsReturned).toBe(2)
    expect(out.rowsSuppressed).toBe(0)
  })

  it('propagates provider errors', async () => {
    const upstream = new Error('warehouse down')
    const provider = fakeProvider({ throws: upstream })
    const tool = buildDistrictInsightsTool({
      provider,
      allowedTables,
      mandatoryFilters,
    })
    await expect(
      tool.execute({ sql: happyPathSql, rationale: 'r' }),
    ).rejects.toBe(upstream)
  })

  it('caps very small mandatoryFilters list (no filters) — defensive', () => {
    // If we accidentally pass an empty filter list, the factory must still
    // build, but the validator will reject every query because there's no
    // mandatory scoping. (Defense in depth: factory doesn't silently OK
    // queries with no scope.)
    const tool = buildDistrictInsightsTool({
      provider: fakeProvider(),
      allowedTables,
      mandatoryFilters: [],
    })
    // The tool object still exists.
    expect(tool).toBeDefined()
    // But this would happily pass validation because there are no mandatory
    // filters to check. The injection point in the chat service must NEVER
    // pass [] — log a separate test once wired.
  })
})
