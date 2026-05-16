import { describe, expect, it } from 'vitest'
import {
  buildQueryDatabricksTool,
  InMemoryDatabricksProvider,
  StubDatabricksProvider,
  type DatabricksProvider,
  type DatabricksRowSet,
} from './queryDatabricks.tool'

const normalize = (sql: string): string =>
  sql.toLowerCase().replace(/\s+/g, ' ').trim()

const SELECT_ID_FROM_VOTERS = 'SELECT id FROM voters'
const PROVIDER_NOT_CALLED = 'provider should not be called'

describe('queryDatabricks tool', () => {
  it('passes a SELECT query through to the provider and returns its shape', async () => {
    const rowSet: DatabricksRowSet = {
      columns: ['id', 'name'],
      rows: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
    }
    const provider = new InMemoryDatabricksProvider(
      new Map([[normalize('SELECT id, name FROM voters LIMIT 2'), rowSet]]),
    )
    const tool = buildQueryDatabricksTool({ provider })

    const out = await tool.execute({
      sql: 'SELECT id, name FROM voters LIMIT 2',
    })

    expect(out.columns).toEqual(['id', 'name'])
    expect(out.rows).toEqual(rowSet.rows)
    expect(out.truncated).toBe(false)
  })

  it('clamps rows to maxRows and sets truncated when provider returns more', async () => {
    const tenRows = Array.from({ length: 10 }, (_, i) => ({ id: i }))
    const provider = new InMemoryDatabricksProvider(
      new Map([
        [normalize(SELECT_ID_FROM_VOTERS), { columns: ['id'], rows: tenRows }],
      ]),
    )
    const tool = buildQueryDatabricksTool({ provider })

    const out = await tool.execute({
      sql: SELECT_ID_FROM_VOTERS,
      maxRows: 3,
    })

    expect(out.rows).toHaveLength(3)
    expect(out.truncated).toBe(true)
  })

  it('does not truncate when rows fit within maxRows', async () => {
    const rows = [{ id: 1 }, { id: 2 }]
    const provider = new InMemoryDatabricksProvider(
      new Map([[normalize(SELECT_ID_FROM_VOTERS), { columns: ['id'], rows }]]),
    )
    const tool = buildQueryDatabricksTool({ provider })

    const out = await tool.execute({
      sql: SELECT_ID_FROM_VOTERS,
      maxRows: 100,
    })

    expect(out.rows).toHaveLength(2)
    expect(out.truncated).toBe(false)
  })

  it('clamps maxRows to the hard ceiling of 1000', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: i }))
    const provider = new InMemoryDatabricksProvider(
      new Map([[normalize(SELECT_ID_FROM_VOTERS), { columns: ['id'], rows }]]),
    )
    const tool = buildQueryDatabricksTool({ provider })

    const out = await tool.execute({
      sql: SELECT_ID_FROM_VOTERS,
      maxRows: 5000,
    })

    expect(out.rows).toHaveLength(1000)
    expect(out.truncated).toBe(true)
  })

  it('rejects INSERT before calling the provider', async () => {
    const provider: DatabricksProvider = {
      query: () => {
        throw new Error(PROVIDER_NOT_CALLED)
      },
    }
    const tool = buildQueryDatabricksTool({ provider })

    await expect(
      tool.execute({ sql: 'INSERT INTO voters (id) VALUES (1)' }),
    ).rejects.toThrow(/only select/i)
  })

  it('rejects UPDATE before calling the provider', async () => {
    const provider: DatabricksProvider = {
      query: () => {
        throw new Error(PROVIDER_NOT_CALLED)
      },
    }
    const tool = buildQueryDatabricksTool({ provider })

    await expect(
      tool.execute({ sql: 'UPDATE voters SET name = "X"' }),
    ).rejects.toThrow(/only select/i)
  })

  it('rejects DELETE before calling the provider', async () => {
    const provider: DatabricksProvider = {
      query: () => {
        throw new Error(PROVIDER_NOT_CALLED)
      },
    }
    const tool = buildQueryDatabricksTool({ provider })

    await expect(
      tool.execute({ sql: 'DELETE FROM voters WHERE id = 1' }),
    ).rejects.toThrow(/only select/i)
  })

  it('rejects DROP before calling the provider', async () => {
    const provider: DatabricksProvider = {
      query: () => {
        throw new Error(PROVIDER_NOT_CALLED)
      },
    }
    const tool = buildQueryDatabricksTool({ provider })

    await expect(tool.execute({ sql: 'DROP TABLE voters' })).rejects.toThrow(
      /only select/i,
    )
  })

  it('strips leading comments and whitespace when checking the first keyword', async () => {
    const rowSet: DatabricksRowSet = { columns: ['x'], rows: [{ x: 1 }] }
    const provider = new InMemoryDatabricksProvider(
      new Map([[normalize('-- a comment\n   SELECT x FROM t'), rowSet]]),
    )
    const tool = buildQueryDatabricksTool({ provider })

    const out = await tool.execute({ sql: '-- a comment\n   SELECT x FROM t' })

    expect(out.rows).toEqual([{ x: 1 }])
  })

  it('rejects non-SELECT even with a leading comment', async () => {
    const provider: DatabricksProvider = {
      query: () => {
        throw new Error(PROVIDER_NOT_CALLED)
      },
    }
    const tool = buildQueryDatabricksTool({ provider })

    await expect(
      tool.execute({ sql: '/* note */ TRUNCATE TABLE voters' }),
    ).rejects.toThrow(/only select/i)
  })

  it('stub provider throws the not-wired error', async () => {
    const provider = new StubDatabricksProvider()

    await expect(provider.query('SELECT 1')).rejects.toThrow(
      /databricks client not wired/i,
    )
  })

  it('rejects multi-statement query that smuggles a DROP after a SELECT', async () => {
    const provider: DatabricksProvider = {
      query: () => {
        throw new Error(PROVIDER_NOT_CALLED)
      },
    }
    const tool = buildQueryDatabricksTool({ provider })

    await expect(
      tool.execute({ sql: 'SELECT 1; DROP TABLE voters' }),
    ).rejects.toThrow(/only select/i)
  })

  it('rejects multi-statement query with two SELECTs', async () => {
    const provider: DatabricksProvider = {
      query: () => {
        throw new Error(PROVIDER_NOT_CALLED)
      },
    }
    const tool = buildQueryDatabricksTool({ provider })

    await expect(tool.execute({ sql: 'SELECT 1; SELECT 2' })).rejects.toThrow(
      /only select/i,
    )
  })

  it('rejects a BOM-prefixed SELECT (cannot statically verify)', async () => {
    const provider: DatabricksProvider = {
      query: () => {
        throw new Error(PROVIDER_NOT_CALLED)
      },
    }
    const tool = buildQueryDatabricksTool({ provider })

    await expect(tool.execute({ sql: '﻿SELECT 1' })).rejects.toThrow(
      /only select/i,
    )
  })

  it('rejects a comment-prefixed multi-statement INSERT smuggle', async () => {
    const provider: DatabricksProvider = {
      query: () => {
        throw new Error(PROVIDER_NOT_CALLED)
      },
    }
    const tool = buildQueryDatabricksTool({ provider })

    await expect(
      tool.execute({
        sql: '-- comment\nSELECT 1; INSERT INTO x VALUES (1)',
      }),
    ).rejects.toThrow(/only select/i)
  })

  it('rejects a CTE whose body contains a DELETE', async () => {
    const provider: DatabricksProvider = {
      query: () => {
        throw new Error(PROVIDER_NOT_CALLED)
      },
    }
    const tool = buildQueryDatabricksTool({ provider })

    await expect(
      tool.execute({
        sql: 'WITH x AS (SELECT 1) DELETE FROM y',
      }),
    ).rejects.toThrow(/only select/i)
  })

  it('allows a read-only CTE that ends in SELECT', async () => {
    const sql = 'WITH x AS (SELECT 1) SELECT * FROM x'
    const rowSet: DatabricksRowSet = {
      columns: ['?column?'],
      rows: [{ '?column?': 1 }],
    }
    const provider = new InMemoryDatabricksProvider(
      new Map([[normalize(sql), rowSet]]),
    )
    const tool = buildQueryDatabricksTool({ provider })

    const out = await tool.execute({ sql })

    expect(out.rows).toEqual([{ '?column?': 1 }])
  })

  it('allows a SELECT with a trailing comment', async () => {
    const sql = 'SELECT 1 /* trailing */'
    const rowSet: DatabricksRowSet = {
      columns: ['?column?'],
      rows: [{ '?column?': 1 }],
    }
    const provider = new InMemoryDatabricksProvider(
      new Map([[normalize(sql), rowSet]]),
    )
    const tool = buildQueryDatabricksTool({ provider })

    const out = await tool.execute({ sql })

    expect(out.rows).toEqual([{ '?column?': 1 }])
  })

  it('allows a slow but legitimate SELECT (timeout is a separate concern)', async () => {
    const sql = '  SELECT pg_sleep(1000)'
    const rowSet: DatabricksRowSet = {
      columns: ['pg_sleep'],
      rows: [{ pg_sleep: '' }],
    }
    const provider = new InMemoryDatabricksProvider(
      new Map([[normalize(sql), rowSet]]),
    )
    const tool = buildQueryDatabricksTool({ provider })

    const out = await tool.execute({ sql })

    expect(out.rows).toEqual([{ pg_sleep: '' }])
  })
})
