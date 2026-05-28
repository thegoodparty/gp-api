import { Parser } from 'node-sql-parser'
import { isRecord } from './isRecord.util'

const parser = new Parser()
const POSTGRES_DIALECT = 'postgresql'

export interface ParsedSingleSelect {
  stmt: Record<string, unknown>
}

export const parseSingleSelect = (sql: string): ParsedSingleSelect | null => {
  let ast: unknown
  try {
    ast = parser.astify(sql, { database: POSTGRES_DIALECT })
  } catch {
    return null
  }
  const statements: unknown[] = Array.isArray(ast) ? ast : [ast]
  if (statements.length !== 1) return null
  const stmt = statements[0]
  if (!isRecord(stmt)) return null
  if (stmt.type !== 'select') return null
  return { stmt }
}
