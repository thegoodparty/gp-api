import type {
  DatabricksProvider,
  DatabricksRowSet,
} from './queryDatabricks.tool'
import { isRecord } from './util/isRecord.util'

export interface DbsqlOperationLike {
  fetchAll: () => Promise<unknown[]>
  close: () => Promise<void>
  getSchema?: () => Promise<
    { columns?: Array<{ columnName: string }> } | null | undefined
  >
}

export interface DbsqlSessionInstanceLike {
  executeStatement: (
    sql: string,
    opts?: { runAsync?: boolean },
  ) => Promise<DbsqlOperationLike>
  close: () => Promise<void>
}

export interface DbsqlSessionLike {
  openSession: () => Promise<DbsqlSessionInstanceLike>
  close: () => Promise<void>
}

export interface DbsqlClientLike {
  connect: (opts: {
    token: string
    host: string
    path: string
  }) => Promise<DbsqlSessionLike>
}

export interface DatabricksSqlProviderOptions {
  hostname: string
  httpPath: string
  accessToken: string
  catalog?: string
  schema?: string
  clientFactory?: () => DbsqlClientLike
}

const noop = (): undefined => undefined

const SQL_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

const assertSqlIdent = (field: 'catalog' | 'schema', value: string): void => {
  if (!SQL_IDENT_RE.test(value)) {
    throw new Error(
      `DatabricksSqlProvider: invalid ${field} "${value}" — must match ` +
        `${SQL_IDENT_RE.source}`,
    )
  }
}

const isClientLike = (v: unknown): v is DbsqlClientLike =>
  isRecord(v) && typeof v.connect === 'function'

const isConstructor = (v: unknown): v is new (...args: never[]) => unknown =>
  typeof v === 'function'

const defaultClientFactory = (): DbsqlClientLike => {
  // WHY: lazy require so tests injecting a clientFactory never load the
  // native @databricks/sql package (heavy native deps, not needed for unit tests).
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const mod = require('@databricks/sql')
  if (!isRecord(mod)) {
    throw new Error('@databricks/sql module did not load')
  }
  const Ctor = mod.DBSQLClient
  if (!isConstructor(Ctor)) {
    throw new Error('@databricks/sql did not export DBSQLClient')
  }
  const instance: unknown = new Ctor()
  if (!isClientLike(instance)) {
    throw new Error('@databricks/sql DBSQLClient is missing connect')
  }
  return instance
}

const toRowRecords = (rows: unknown[]): Array<Record<string, unknown>> => {
  const out: Array<Record<string, unknown>> = []
  for (const r of rows) {
    if (isRecord(r)) out.push(r)
  }
  return out
}

export class DatabricksSqlProvider implements DatabricksProvider {
  private readonly opts: DatabricksSqlProviderOptions
  private readonly clientFactory: () => DbsqlClientLike
  private clientConn?: DbsqlSessionLike
  private session?: DbsqlSessionInstanceLike
  private connectPromise?: Promise<void>
  private closed = false

  constructor(opts: DatabricksSqlProviderOptions) {
    if (opts.catalog !== undefined) assertSqlIdent('catalog', opts.catalog)
    if (opts.schema !== undefined) assertSqlIdent('schema', opts.schema)
    this.opts = opts
    this.clientFactory = opts.clientFactory ?? defaultClientFactory
  }

  async query(sql: string): Promise<DatabricksRowSet> {
    const session = await this.ensureSession()
    const op = await session.executeStatement(sql, { runAsync: true })
    try {
      const rawRows = await op.fetchAll()
      const rows = toRowRecords(rawRows)
      const columns = await this.resolveColumns(op, rows)
      return { columns, rows }
    } finally {
      await op.close().catch(noop)
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    const session = this.session
    const conn = this.clientConn
    this.session = undefined
    this.clientConn = undefined
    if (session) {
      await session.close().catch(noop)
    }
    if (conn) {
      await conn.close().catch(noop)
    }
  }

  private async ensureSession(): Promise<DbsqlSessionInstanceLike> {
    if (this.session) return this.session
    if (!this.connectPromise) {
      this.connectPromise = this.openSession().catch((err) => {
        this.connectPromise = undefined
        throw err
      })
    }
    await this.connectPromise
    if (!this.session) {
      throw new Error(
        'DatabricksSqlProvider: session unavailable after connect',
      )
    }
    return this.session
  }

  private async openSession(): Promise<void> {
    const client = this.clientFactory()
    const conn = await client.connect({
      token: this.opts.accessToken,
      host: this.opts.hostname,
      path: this.opts.httpPath,
    })
    let session: DbsqlSessionInstanceLike
    try {
      session = await conn.openSession()
      if (this.opts.catalog) {
        await this.runStatement(session, `USE CATALOG ${this.opts.catalog}`)
      }
      if (this.opts.schema) {
        await this.runStatement(session, `USE SCHEMA ${this.opts.schema}`)
      }
    } catch (err) {
      await conn.close().catch(noop)
      throw err
    }
    this.clientConn = conn
    this.session = session
  }

  private async runStatement(
    session: DbsqlSessionInstanceLike,
    sql: string,
  ): Promise<void> {
    const op = await session.executeStatement(sql, { runAsync: true })
    await op.close().catch(noop)
  }

  private async resolveColumns(
    op: DbsqlOperationLike,
    rows: Array<Record<string, unknown>>,
  ): Promise<string[]> {
    if (op.getSchema) {
      try {
        const schema = await op.getSchema()
        if (
          schema &&
          isRecord(schema) &&
          Array.isArray(schema.columns) &&
          schema.columns.length > 0
        ) {
          return schema.columns
            .map((c) => (isRecord(c) ? c.columnName : undefined))
            .filter((v): v is string => typeof v === 'string')
        }
      } catch {
        // fall through to first-row derivation
      }
    }
    if (rows.length === 0) return []
    return Object.keys(rows[0])
  }
}
