import { describe, expect, it, vi } from 'vitest'
import {
  DatabricksSqlProvider,
  type DbsqlClientLike,
  type DbsqlOperationLike,
  type DbsqlSessionInstanceLike,
  type DbsqlSessionLike,
} from './databricksProvider'

const noop = (): undefined => undefined
const HOST = 'host.cloud.databricks.com'
const PATH = '/sql/1.0/warehouses/abc'
const SELECT_X = 'SELECT 1 AS x'
const SELECT_N = 'SELECT 1 AS n'

interface ExecuteCall {
  sql: string
  runAsync?: boolean
}

interface FakeOperationOptions {
  rows: unknown[]
  columns?: string[]
  schemaReturnsNull?: boolean
  noGetSchema?: boolean
}

const makeOperation = (opts: FakeOperationOptions): DbsqlOperationLike => {
  const op: DbsqlOperationLike = {
    fetchAll: vi.fn(async () => opts.rows),
    close: vi.fn(async () => noop()),
  }
  if (!opts.noGetSchema) {
    op.getSchema = vi.fn(async () => {
      if (opts.schemaReturnsNull) return null
      if (!opts.columns) return undefined
      return { columns: opts.columns.map((c) => ({ columnName: c })) }
    })
  }
  return op
}

interface FakeFactoryState {
  clientFactoryCalls: number
  connectCalls: number
  openSessionCalls: number
  clientCloseCalls: number
  sessionCloseCalls: number
  executeCalls: ExecuteCall[]
  lastOperations: DbsqlOperationLike[]
  failNextExecute?: Error
  responder: (sql: string) => DbsqlOperationLike
}

const makeFactory = (
  responder: (sql: string) => DbsqlOperationLike,
): { factory: () => DbsqlClientLike; state: FakeFactoryState } => {
  const state: FakeFactoryState = {
    clientFactoryCalls: 0,
    connectCalls: 0,
    openSessionCalls: 0,
    clientCloseCalls: 0,
    sessionCloseCalls: 0,
    executeCalls: [],
    lastOperations: [],
    responder,
  }

  const factory = (): DbsqlClientLike => {
    state.clientFactoryCalls++
    return {
      connect: async () => {
        state.connectCalls++
        const session: DbsqlSessionLike = {
          openSession: async () => {
            state.openSessionCalls++
            const sessionInstance: DbsqlSessionInstanceLike = {
              executeStatement: async (sql, opts) => {
                state.executeCalls.push({ sql, runAsync: opts?.runAsync })
                if (state.failNextExecute) {
                  const err = state.failNextExecute
                  state.failNextExecute = undefined
                  throw err
                }
                const op = state.responder(sql)
                state.lastOperations.push(op)
                return op
              },
              close: async () => {
                state.sessionCloseCalls++
              },
            }
            return sessionInstance
          },
          close: async () => {
            state.clientCloseCalls++
          },
        }
        return session
      },
    }
  }

  return { factory, state }
}

const baseOpts = {
  hostname: 'example.cloud.databricks.com',
  httpPath: '/sql/1.0/warehouses/xyz',
  accessToken: 'dapi-secret',
}

describe('DatabricksSqlProvider', () => {
  it('executes a SELECT and returns columns from schema metadata', async () => {
    const { factory, state } = makeFactory(() =>
      makeOperation({ rows: [{ n: 1 }], columns: ['n'] }),
    )
    const provider = new DatabricksSqlProvider({
      ...baseOpts,
      clientFactory: factory,
    })

    const result = await provider.query(SELECT_N)

    expect(result).toEqual({ columns: ['n'], rows: [{ n: 1 }] })
    expect(state.executeCalls).toEqual([{ sql: SELECT_N, runAsync: true }])
  })

  it('derives columns from the first row when getSchema returns null', async () => {
    const { factory } = makeFactory(() =>
      makeOperation({
        rows: [{ id: 7, label: 'x' }],
        schemaReturnsNull: true,
      }),
    )
    const provider = new DatabricksSqlProvider({
      ...baseOpts,
      clientFactory: factory,
    })

    const result = await provider.query('SELECT id, label FROM t')

    expect(result.columns).toEqual(['id', 'label'])
    expect(result.rows).toEqual([{ id: 7, label: 'x' }])
  })

  it('derives columns from the first row when getSchema is unavailable', async () => {
    const { factory } = makeFactory(() =>
      makeOperation({
        rows: [{ a: 'one', b: 'two' }],
        noGetSchema: true,
      }),
    )
    const provider = new DatabricksSqlProvider({
      ...baseOpts,
      clientFactory: factory,
    })

    const result = await provider.query('SELECT a, b FROM t')

    expect(result.columns).toEqual(['a', 'b'])
  })

  it('returns empty rowset without crashing on no results', async () => {
    const { factory } = makeFactory(() =>
      makeOperation({ rows: [], schemaReturnsNull: true }),
    )
    const provider = new DatabricksSqlProvider({
      ...baseOpts,
      clientFactory: factory,
    })

    const result = await provider.query('SELECT 1 WHERE 1 = 0')

    expect(result).toEqual({ columns: [], rows: [] })
  })

  it('opens the session lazily — no connect on construction', async () => {
    const { factory, state } = makeFactory(() =>
      makeOperation({ rows: [], schemaReturnsNull: true }),
    )

    new DatabricksSqlProvider({ ...baseOpts, clientFactory: factory })

    expect(state.clientFactoryCalls).toBe(0)
    expect(state.connectCalls).toBe(0)
    expect(state.openSessionCalls).toBe(0)
  })

  it('reuses the session across queries', async () => {
    const { factory, state } = makeFactory(() =>
      makeOperation({ rows: [{ x: 1 }], columns: ['x'] }),
    )
    const provider = new DatabricksSqlProvider({
      ...baseOpts,
      clientFactory: factory,
    })

    await provider.query(SELECT_X)
    await provider.query(SELECT_X)
    await provider.query(SELECT_X)

    expect(state.clientFactoryCalls).toBe(1)
    expect(state.connectCalls).toBe(1)
    expect(state.openSessionCalls).toBe(1)
    expect(state.executeCalls).toHaveLength(3)
  })

  it('applies catalog and schema on first query, not on subsequent', async () => {
    const { factory, state } = makeFactory(() =>
      makeOperation({ rows: [{ x: 1 }], columns: ['x'] }),
    )
    const provider = new DatabricksSqlProvider({
      ...baseOpts,
      catalog: 'goodparty_data_catalog',
      schema: 'dbt',
      clientFactory: factory,
    })

    await provider.query(SELECT_X)
    await provider.query('SELECT 2 AS x')

    expect(state.executeCalls.map((c) => c.sql)).toEqual([
      'USE CATALOG goodparty_data_catalog',
      'USE SCHEMA dbt',
      SELECT_X,
      'SELECT 2 AS x',
    ])
  })

  it('close() closes operation, session, and client; is idempotent', async () => {
    const { factory, state } = makeFactory(() =>
      makeOperation({ rows: [{ x: 1 }], columns: ['x'] }),
    )
    const provider = new DatabricksSqlProvider({
      ...baseOpts,
      clientFactory: factory,
    })

    await provider.query(SELECT_X)
    const op = state.lastOperations[state.lastOperations.length - 1]

    await provider.close()
    await provider.close()

    expect(op.close).toHaveBeenCalledTimes(1)
    expect(state.sessionCloseCalls).toBe(1)
    expect(state.clientCloseCalls).toBe(1)
  })

  it('close() is safe when called without any prior query', async () => {
    const { factory, state } = makeFactory(() =>
      makeOperation({ rows: [], schemaReturnsNull: true }),
    )
    const provider = new DatabricksSqlProvider({
      ...baseOpts,
      clientFactory: factory,
    })

    await expect(provider.close()).resolves.toBeUndefined()
    expect(state.clientCloseCalls).toBe(0)
    expect(state.sessionCloseCalls).toBe(0)
  })

  it('propagates query errors and keeps the session open for retry', async () => {
    const boom = new Error('boom')
    const { factory, state } = makeFactory(() =>
      makeOperation({ rows: [{ x: 1 }], columns: ['x'] }),
    )
    const provider = new DatabricksSqlProvider({
      ...baseOpts,
      clientFactory: factory,
    })

    state.failNextExecute = boom
    await expect(provider.query(SELECT_X)).rejects.toBe(boom)

    const result = await provider.query(SELECT_X)
    expect(result).toEqual({ columns: ['x'], rows: [{ x: 1 }] })
    expect(state.openSessionCalls).toBe(1)
    expect(state.connectCalls).toBe(1)
  })

  it('passes BigInt row values through unchanged', async () => {
    const { factory } = makeFactory(() =>
      makeOperation({ rows: [{ n: 42n }], columns: ['n'] }),
    )
    const provider = new DatabricksSqlProvider({
      ...baseOpts,
      clientFactory: factory,
    })

    const result = await provider.query('SELECT 42 AS n')

    expect(result.columns).toEqual(['n'])
    expect(result.rows).toEqual([{ n: 42n }])
    expect(result.rows[0].n).toBe(42n)
  })

  it('passes null column values through unchanged', async () => {
    const { factory } = makeFactory(() =>
      makeOperation({
        rows: [{ name: null, count: 100n }],
        columns: ['name', 'count'],
      }),
    )
    const provider = new DatabricksSqlProvider({
      ...baseOpts,
      clientFactory: factory,
    })

    const result = await provider.query('SELECT name, count FROM t')

    expect(result.columns).toEqual(['name', 'count'])
    expect(result.rows).toEqual([{ name: null, count: 100n }])
  })

  it('rejects catalog values containing SQL metacharacters', () => {
    expect(
      () =>
        new DatabricksSqlProvider({
          ...baseOpts,
          catalog: 'foo;DROP TABLE x',
          clientFactory: () => ({ connect: async () => ({}) as never }),
        }),
    ).toThrow(/invalid catalog/)
  })

  it('rejects schema values containing SQL metacharacters', () => {
    expect(
      () =>
        new DatabricksSqlProvider({
          ...baseOpts,
          schema: 'a b',
          clientFactory: () => ({ connect: async () => ({}) as never }),
        }),
    ).toThrow(/invalid schema/)
  })

  it('rejects catalog values starting with a digit', () => {
    expect(
      () =>
        new DatabricksSqlProvider({
          ...baseOpts,
          catalog: '1bad',
          clientFactory: () => ({ connect: async () => ({}) as never }),
        }),
    ).toThrow(/invalid catalog/)
  })

  it('accepts valid identifier catalog and schema values', () => {
    const { factory } = makeFactory(() =>
      makeOperation({ rows: [], schemaReturnsNull: true }),
    )
    expect(
      () =>
        new DatabricksSqlProvider({
          ...baseOpts,
          catalog: 'goodparty_data_catalog',
          schema: 'dbt',
          clientFactory: factory,
        }),
    ).not.toThrow()
  })

  it('passes connection credentials to the underlying client', async () => {
    const connectArgs: Array<{ host: string; path: string; token: string }> = []
    const factory = (): DbsqlClientLike => ({
      connect: async (opts) => {
        connectArgs.push(opts)
        return {
          openSession: async () => ({
            executeStatement: async () =>
              makeOperation({ rows: [{ n: 1 }], columns: ['n'] }),
            close: async () => noop(),
          }),
          close: async () => noop(),
        }
      },
    })

    const provider = new DatabricksSqlProvider({
      hostname: HOST,
      httpPath: PATH,
      accessToken: 'dapi-token',
      clientFactory: factory,
    })

    await provider.query(SELECT_N)

    expect(connectArgs).toEqual([
      {
        host: HOST,
        path: PATH,
        token: 'dapi-token',
      },
    ])
  })
})
