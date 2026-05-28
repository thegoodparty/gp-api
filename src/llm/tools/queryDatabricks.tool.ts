import { z } from 'zod'
import type { LlmStreamTool } from '@/llm/services/llm.service'
import { isRecord } from './util/isRecord.util'
import { parseSingleSelect } from './util/sqlAst.util'

export interface DatabricksRowSet {
  columns: string[]
  rows: Array<Record<string, unknown>>
}

export interface QueryDatabricksInput {
  sql: string
  maxRows?: number
}

export interface QueryDatabricksOutput {
  columns: string[]
  rows: Array<Record<string, unknown>>
  truncated: boolean
}

export interface DatabricksProvider {
  query: (sql: string) => Promise<DatabricksRowSet>
}

const DEFAULT_MAX_ROWS = 100
const HARD_MAX_ROWS = 1000

const queryDatabricksInputSchema = z.object({
  sql: z.string().min(1),
  maxRows: z.number().int().positive().optional(),
})

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

const isSelectQuery = (sql: string): boolean => {
  if (INVISIBLE_CHARS.test(sql)) return false
  const parsed = parseSingleSelect(sql)
  if (!parsed) return false
  return !containsWriteNode(parsed.stmt)
}

const clampMaxRows = (requested?: number): number => {
  if (requested === undefined) return DEFAULT_MAX_ROWS
  return Math.min(requested, HARD_MAX_ROWS)
}

export const buildQueryDatabricksTool = (deps: {
  provider: DatabricksProvider
}): LlmStreamTool<QueryDatabricksInput, QueryDatabricksOutput> => ({
  description:
    'Run a read-only SQL query against the Databricks warehouse to look up voter, district, election, or campaign-history data. Use only for read queries. SELECT only — DDL or DML is rejected.',
  inputSchema: queryDatabricksInputSchema,
  execute: async ({ sql, maxRows }) => {
    if (!isSelectQuery(sql)) {
      throw new Error('Only SELECT queries are permitted')
    }

    const limit = clampMaxRows(maxRows)
    const result = await deps.provider.query(sql)
    const truncated = result.rows.length > limit
    return {
      columns: result.columns,
      rows: truncated ? result.rows.slice(0, limit) : result.rows,
      truncated,
    }
  },
})

export class StubDatabricksProvider implements DatabricksProvider {
  query(_sql: string): Promise<DatabricksRowSet> {
    return Promise.reject(
      new Error(
        'Databricks client not wired — install @databricks/sql and provide credentials',
      ),
    )
  }
}

const normalizeSql = (sql: string): string =>
  sql.toLowerCase().replace(/\s+/g, ' ').trim()

export class InMemoryDatabricksProvider implements DatabricksProvider {
  constructor(private readonly responses: Map<string, DatabricksRowSet>) {}

  query(sql: string): Promise<DatabricksRowSet> {
    const hit = this.responses.get(normalizeSql(sql))
    if (!hit) {
      return Promise.resolve({ columns: [], rows: [] })
    }
    return Promise.resolve(hit)
  }
}
