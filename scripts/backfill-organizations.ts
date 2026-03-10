/**
 * Run the organization backfill against a live database (WRITES to DB).
 *
 * Creates/updates Organization rows for every Campaign and ElectedOffice,
 * enriched with position & district data from the election-api.
 *
 * Usage:
 *   npx nest build && npx tsx scripts/backfill-organizations.ts
 *
 * Required env vars:
 *   DATABASE_URL          — Postgres connection string
 *   ELECTION_API_URL      — e.g. https://election-api.goodparty.org
 *
 * Optional env vars (may be required by other NestJS modules during bootstrap):
 *   Copy from your .env or production config if bootstrap fails.
 *
 * Output (written to scripts/output/, gitignored):
 *   backfill-detail.jsonl   — one JSON line per record (streamed)
 *   backfill-summary.json   — category counts + errors
 *
 * TIP: Run the dry-run first to preview what will happen:
 *   npx tsx scripts/backfill-dry-run.ts
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
const DETAIL_PATH = join(OUTPUT_DIR, 'backfill-detail.jsonl')
const SUMMARY_PATH = join(OUTPUT_DIR, 'backfill-summary.json')

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  console.log('Bootstrapping NestJS application context...')
  const app = await NestFactory.createApplicationContext(BackfillModule, {
    logger: ['error', 'warn'],
  })

  const backfillService = app.get(OrganizationsBackfillService)

  // Stream a dry-run in parallel to capture per-record detail,
  // then run the real backfill which does the actual writes.
  // This gives us both the detail JSONL and the real writes.

  // --- Phase 1: Dry run for detail logging ---
  const detailStream = createWriteStream(DETAIL_PATH, { flags: 'w' })
  const errors: { type: string; id: number | string; error: string }[] = []
  let totalRecords = 0

  const startedAt = new Date().toISOString()
  console.log(`\nBackfill started at ${startedAt}`)
  console.log(`Streaming detail to: ${DETAIL_PATH}`)
  console.log('')

  const onRecord = (record: BackfillDryRunRecord) => {
    detailStream.write(JSON.stringify(record) + '\n')
    totalRecords++

    if (record.error) {
      errors.push({ type: record.type, id: record.id, error: record.error })
    }

    if (totalRecords % 100 === 0) {
      console.log(`  [dry-run phase] processed ${totalRecords} records...`)
    }
  }

  console.log('Phase 1/2: Running dry-run to capture per-record detail...')
  const { campaignStats: dryRunCampaignStats, eoStats: dryRunEoStats } =
    await backfillService.dryRun(onRecord)
  detailStream.end()

  const dryRunCampaignTotal = Object.values(dryRunCampaignStats).reduce(
    (a, b) => a + b,
    0,
  )
  const dryRunEoTotal = Object.values(dryRunEoStats).reduce((a, b) => a + b, 0)

  console.log(
    `  Dry-run complete: ${dryRunCampaignTotal} campaigns, ${dryRunEoTotal} elected offices`,
  )
  console.log('')

  // --- Phase 2: Real backfill ---
  console.log('Phase 2/2: Running backfill (writing to database)...')
  await backfillService.backfillOrganizations()

  const completedAt = new Date().toISOString()

  const summary = {
    startedAt,
    completedAt,
    campaigns: {
      total: dryRunCampaignTotal,
      categories: dryRunCampaignStats,
    },
    electedOffices: {
      total: dryRunEoTotal,
      categories: dryRunEoStats,
    },
    errors,
  }

  await writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2) + '\n')

  console.log(`\nBackfill complete at ${completedAt}`)
  console.log(`Total records: ${totalRecords}`)
  console.log(`Campaigns: ${dryRunCampaignTotal}`)
  console.log(`  Categories:`, JSON.stringify(dryRunCampaignStats, null, 2))
  console.log(`Elected offices: ${dryRunEoTotal}`)
  console.log(`  Categories:`, JSON.stringify(dryRunEoStats, null, 2))
  console.log(`Errors: ${errors.length}`)
  if (errors.length > 0) {
    console.log(`  First 10 errors:`)
    for (const err of errors.slice(0, 10)) {
      console.log(`    ${err.type} ${err.id}: ${err.error}`)
    }
  }
  console.log(`\nDetail: ${DETAIL_PATH}`)
  console.log(`Summary: ${SUMMARY_PATH}`)

  await app.close()
}

main().catch(async (e) => {
  console.error('Backfill failed:', e)
  process.exit(1)
})
