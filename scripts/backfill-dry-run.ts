/**
 * Dry-run the organization backfill against a live database (no writes).
 *
 * Resolves position & district data for every Campaign and ElectedOffice
 * exactly as the real backfill would, but skips all database writes.
 * Results are streamed to a JSONL file so you can `tail -f` while it runs.
 *
 * Usage:
 *   npx nest build && npx tsx scripts/backfill-dry-run.ts
 *
 * Required env vars:
 *   DATABASE_URL          — Postgres connection string
 *   ELECTION_API_URL      — e.g. https://election-api.goodparty.org
 *
 * Optional env vars (may be required by other NestJS modules during bootstrap):
 *   Copy from your .env or production config if bootstrap fails.
 *
 * Output (written to scripts/output/, gitignored):
 *   backfill-dry-run-detail.jsonl  — one JSON line per record (streamed)
 *   backfill-dry-run-summary.json  — category counts + errors
 *
 * Analyse results:
 *   # Watch progress in real time
 *   tail -f scripts/output/backfill-dry-run-detail.jsonl | jq .
 *
 *   # Category breakdown
 *   cat scripts/output/backfill-dry-run-detail.jsonl | jq -r '.resolved.category // "error"' | sort | uniq -c | sort -rn
 *
 *   # Errors only
 *   cat scripts/output/backfill-dry-run-detail.jsonl | jq 'select(.error != null)'
 *
 *   # New orgs that would be created
 *   cat scripts/output/backfill-dry-run-detail.jsonl | jq 'select(.wouldCreate == true)' | wc -l
 *
 *   # Records that would change
 *   cat scripts/output/backfill-dry-run-detail.jsonl | jq 'select(.wouldWrite == true)' | wc -l
 */
import '../dist/configrc'

import { NestFactory } from '@nestjs/core'
import { createWriteStream, mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { BackfillModule } from './backfill.module'
import {
  BackfillDryRunRecord,
  OrganizationsBackfillService,
} from '../dist/organizations/services/organizations-backfill.service'

const OUTPUT_DIR = join(__dirname, 'output')
const DETAIL_PATH = join(OUTPUT_DIR, 'backfill-dry-run-detail.jsonl')
const SUMMARY_PATH = join(OUTPUT_DIR, 'backfill-dry-run-summary.json')

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  console.log('Bootstrapping NestJS application context...')
  const app = await NestFactory.createApplicationContext(BackfillModule, {
    logger: ['error', 'warn'],
  })

  const backfillService = app.get(OrganizationsBackfillService)

  const detailStream = createWriteStream(DETAIL_PATH, { flags: 'w' })
  const errors: { type: string; id: number | string; error: string }[] = []
  let totalRecords = 0

  const startedAt = new Date().toISOString()
  console.log(`Dry run started at ${startedAt}`)
  console.log(`Streaming detail to: ${DETAIL_PATH}`)

  const onRecord = (record: BackfillDryRunRecord) => {
    detailStream.write(JSON.stringify(record) + '\n')
    totalRecords++

    if (record.error) {
      errors.push({ type: record.type, id: record.id, error: record.error })
    }

    if (totalRecords % 100 === 0) {
      console.log(`  processed ${totalRecords} records...`)
    }
  }

  const { campaignStats, eoStats } = await backfillService.dryRun(onRecord)

  detailStream.end()

  const completedAt = new Date().toISOString()

  const campaignTotal = Object.values(campaignStats).reduce((a, b) => a + b, 0)
  const eoTotal = Object.values(eoStats).reduce((a, b) => a + b, 0)

  const summary = {
    startedAt,
    completedAt,
    campaigns: { total: campaignTotal, categories: campaignStats },
    electedOffices: { total: eoTotal, categories: eoStats },
    errors,
  }

  await writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2) + '\n')

  console.log(`\nDry run complete at ${completedAt}`)
  console.log(`Total records: ${totalRecords}`)
  console.log(`Campaigns: ${campaignTotal}`)
  console.log(`Elected offices: ${eoTotal}`)
  console.log(`Errors: ${errors.length}`)
  console.log(`\nDetail: ${DETAIL_PATH}`)
  console.log(`Summary: ${SUMMARY_PATH}`)

  await app.close()
}

main().catch(async (e) => {
  console.error('Dry run failed:', e)
  process.exit(1)
})
