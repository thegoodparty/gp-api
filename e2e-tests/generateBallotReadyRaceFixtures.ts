import { writeFileSync } from 'node:fs'
import '../src/configrc'

export type BallotReadyRaceFixture = {
  state: NonNullable<PrismaJson.CampaignDetails['state']>
  raceId: NonNullable<PrismaJson.CampaignDetails['raceId']>
  electionId: Exclude<
    PrismaJson.CampaignDetails['electionId'],
    null | undefined
  >
  positionId: Exclude<
    PrismaJson.CampaignDetails['positionId'],
    null | undefined
  >
  ballotLevel: NonNullable<PrismaJson.CampaignDetails['ballotLevel']>
  otherOffice: NonNullable<PrismaJson.CampaignDetails['otherOffice']>
  electionDate: NonNullable<PrismaJson.CampaignDetails['electionDate']>
}

type DatabricksStatementStatusState =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'
  | 'CLOSED'

type DatabricksStatementResponse = {
  statement_id: string
  status: {
    state: DatabricksStatementStatusState
    error?: {
      message?: string
    }
  }
  manifest?: {
    schema?: {
      columns?: Array<{
        name: string
        position: number
      }>
    }
  }
  result?: {
    data_array?: unknown[][]
  }
}

type BallotReadyRaceFixtureRow = {
  state: string
  raceId: string
  electionId: string
  positionId: string
  ballotLevel: string
  otherOffice: string
  electionDate: string
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing ${name}. Example:\n` +
        `  ${name}="..."\n` +
        `Required env vars:\n` +
        `  DATABRICKS_HOST (ex: "https://dbc-xxxx.cloud.databricks.com")\n` +
        `  DATABRICKS_TOKEN (a Databricks PAT)\n` +
        `  DATABRICKS_WAREHOUSE_ID (SQL Warehouse id)\n`,
    )
  }
  return value
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toObjectRows(
  resp: DatabricksStatementResponse,
): Record<string, unknown>[] {
  const cols = resp.manifest?.schema?.columns
  const rows = resp.result?.data_array
  if (!cols || !rows) return []

  // Ensure column positions are stable/ordered.
  const orderedCols = [...cols].sort((a, b) => a.position - b.position)

  return rows.map((row) => {
    const obj: Record<string, unknown> = {}
    for (let i = 0; i < orderedCols.length; i++) {
      obj[orderedCols[i].name] = row[i]
    }
    return obj
  })
}

function assertString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`Expected non-empty string for ${field}, got: ${String(v)}`)
  }
  return v
}

function parseFixtureRows(
  objs: Record<string, unknown>[],
): BallotReadyRaceFixtureRow[] {
  return objs.map((o) => ({
    state: assertString(o.state, 'state'),
    raceId: assertString(o.raceId, 'raceId'),
    electionId: assertString(o.electionId, 'electionId'),
    positionId: assertString(o.positionId, 'positionId'),
    ballotLevel: assertString(o.ballotLevel, 'ballotLevel'),
    otherOffice: assertString(o.otherOffice, 'otherOffice'),
    electionDate: assertString(o.electionDate, 'electionDate'),
  }))
}

function tsStringLiteral(s: string): string {
  return JSON.stringify(s)
}

function renderFixturesTs(rows: BallotReadyRaceFixtureRow[]): string {
  const body = rows
    .map((r) => {
      return (
        `  {\n` +
        `    state: ${tsStringLiteral(r.state)},\n` +
        `    raceId: ${tsStringLiteral(r.raceId)},\n` +
        `    electionId: ${tsStringLiteral(r.electionId)},\n` +
        `    positionId: ${tsStringLiteral(r.positionId)},\n` +
        `    ballotLevel: BallotReadyPositionLevel.${r.ballotLevel},\n` +
        `    otherOffice: ${tsStringLiteral(r.otherOffice)},\n` +
        `    electionDate: ${tsStringLiteral(r.electionDate)},\n` +
        `  }`
      )
    })
    .join(',\n')

  return `import { BallotReadyPositionLevel } from '@/campaigns/campaigns.types'
import { BallotReadyRaceFixture } from '@e2e-tests/generateBallotReadyRaceFixtures'
// IMPORTANT: If you wish to edit this file, edit generateBallotReadyRaceFixtures.ts instead

// This is real BallotReady data, for use in tests that depend on real data
// You can expand what fields this provides from Race, Position, Election, etc.,
// by expanding the associated Databricks query and re-generating the fixtures via npm run fixtures:ballotready-races
export const BallotReadyRaceFixtures = [
${body.length ? body : '  // (empty)'}
] satisfies ReadonlyArray<BallotReadyRaceFixture>
`
}

async function run() {
  const outputPath = 'src/shared/testing/ballotreadyRaceFixtures.ts'

  const host = requiredEnv('DATABRICKS_HOST').replace(/\/+$/, '')
  const token = requiredEnv('DATABRICKS_TOKEN')
  const warehouseId = requiredEnv('DATABRICKS_WAREHOUSE_ID')

  const statement =
    process.env.DATABRICKS_SQL ??
    `
WITH base AS (
  SELECT
    l2.state,
    race.id AS raceId,
    race.election.id AS electionId,
    position.id AS positionId,
    position.level AS ballotLevel,
    position.name AS otherOffice,
    election.original_election_date AS electionDate
  FROM goodparty_data_catalog.dbt.stg_model_predictions__llm_l2_br_match_20250811 l2
  INNER JOIN goodparty_data_catalog.dbt.stg_airbyte_source__ballotready_api_position position
    ON l2.br_database_id = position.database_id
  INNER JOIN goodparty_data_catalog.dbt.stg_airbyte_source__ballotready_api_race race
    ON position.database_id = race.position.databaseId
  INNER JOIN goodparty_data_catalog.dbt.stg_airbyte_source__ballotready_api_election election
    ON race.election.databaseId = election.database_id
  WHERE l2.is_matched = true
    AND l2.confidence >= 95
    AND election.original_election_date >= DATE '2026-01-01'
    AND election.original_election_date <  DATE '2028-01-01'
),
ranked AS (
  SELECT
    *,
    row_number() OVER (PARTITION BY state ORDER BY rand()) AS rn
  FROM base
)
SELECT
  state,
  raceId,
  electionId,
  positionId,
  ballotLevel,
  otherOffice,
  electionDate
FROM ranked
WHERE rn <= 2
ORDER BY state
LIMIT 50;
`.trim()

  const createResp = await fetch(`${host}/api/2.0/sql/statements/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      statement,
      warehouse_id: warehouseId,
      disposition: 'INLINE',
      format: 'JSON_ARRAY',
      wait_timeout: '30s',
      on_wait_timeout: 'CONTINUE',
    }),
  })

  if (!createResp.ok) {
    throw new Error(
      `Databricks statement submit failed (${createResp.status}): ${await createResp.text()}`,
    )
  }

  let status: DatabricksStatementResponse =
    (await createResp.json()) as DatabricksStatementResponse

  // Poll until done.
  while (
    status.status.state === 'PENDING' ||
    status.status.state === 'RUNNING'
  ) {
    await sleep(500)
    const pollResp = await fetch(
      `${host}/api/2.0/sql/statements/${status.statement_id}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    if (!pollResp.ok) {
      throw new Error(
        `Databricks statement poll failed (${pollResp.status}): ${await pollResp.text()}`,
      )
    }
    status = (await pollResp.json()) as DatabricksStatementResponse
  }

  if (status.status.state !== 'SUCCEEDED') {
    const message =
      status.status.error?.message ??
      `Statement ended in state ${status.status.state}`
    throw new Error(`Databricks statement failed: ${message}`)
  }

  const objRows = toObjectRows(status)
  const fixtures = parseFixtureRows(objRows)

  // Stable ordering in generated file.
  fixtures.sort((a, b) =>
    a.state === b.state
      ? a.raceId.localeCompare(b.raceId)
      : a.state.localeCompare(b.state),
  )

  const tsOut = renderFixturesTs(fixtures)
  writeFileSync(outputPath, tsOut, 'utf8')
  // eslint-disable-next-line no-console
  console.log(`Wrote ${fixtures.length} fixtures -> ${outputPath}`)
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
