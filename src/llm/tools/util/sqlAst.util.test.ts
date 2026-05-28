import { describe, expect, it } from 'vitest'
import { parseSingleSelect } from './sqlAst.util'

describe('parseSingleSelect', () => {
  it('returns a parsed statement for a valid SELECT', () => {
    const result = parseSingleSelect('SELECT id FROM voters')
    expect(result).not.toBeNull()
    expect(result?.stmt.type).toBe('select')
  })

  it('returns null for INSERT', () => {
    expect(parseSingleSelect('INSERT INTO voters (id) VALUES (1)')).toBeNull()
  })

  it('returns null for UPDATE', () => {
    expect(parseSingleSelect('UPDATE voters SET name = $1')).toBeNull()
  })

  it('returns null for DELETE', () => {
    expect(parseSingleSelect('DELETE FROM voters WHERE id = 1')).toBeNull()
  })

  it('returns null for multi-statement input', () => {
    expect(parseSingleSelect('SELECT 1; SELECT 2')).toBeNull()
  })

  it('returns null for multi-statement smuggling a DROP', () => {
    expect(parseSingleSelect('SELECT 1; DROP TABLE voters')).toBeNull()
  })

  it('returns null for syntactically invalid SQL', () => {
    expect(parseSingleSelect('SELEC bogus stuff')).toBeNull()
  })

  it('returns null for a CTE that ends in DELETE', () => {
    expect(parseSingleSelect('WITH x AS (SELECT 1) DELETE FROM y')).toBeNull()
  })

  it('returns parsed result for a CTE ending in SELECT', () => {
    const result = parseSingleSelect('WITH x AS (SELECT 1) SELECT * FROM x')
    expect(result).not.toBeNull()
    expect(result?.stmt.type).toBe('select')
  })

  it('exposes the AST so callers can layer further checks', () => {
    const result = parseSingleSelect('SELECT id FROM voters WHERE id = 1')
    expect(result).not.toBeNull()
    expect(result?.stmt).toHaveProperty('where')
    expect(result?.stmt).toHaveProperty('from')
  })
})
