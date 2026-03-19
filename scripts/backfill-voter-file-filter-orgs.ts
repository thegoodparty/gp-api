/**
 * Backfill organizationSlug onto VoterFileFilter records.
 *
 * For each VoterFileFilter where organizationSlug IS NULL:
 *   1. Sets organizationSlug = 'campaign-{campaignId}'
 *   2. If the campaign has elected office(s), creates a duplicate
 *      VoterFileFilter for each elected office org (organizationSlug = 'eo-{eoId}')
 *
 * Idempotent: only processes records where organizationSlug IS NULL.
 *
 * Usage:
 *   npm run build && npx tsx scripts/backfill-voter-file-filter-orgs.ts
 *
 * Required env vars:
 *   DATABASE_URL — Postgres connection string
 *
 * Output (written to scripts/output/, gitignored):
 *   vff-backfill-detail.jsonl  — one JSON line per record (streamed)
 *   vff-backfill-summary.json  — totals + errors
 */
import '../dist/configrc'

import { PrismaClient, VoterFileFilter } from '@prisma/client'

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>
import { createWriteStream, mkdirSync, WriteStream } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'

// ── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 100
const OUTPUT_DIR = join(__dirname, 'output')
const DETAIL_PATH = join(OUTPUT_DIR, 'vff-backfill-detail.jsonl')
const SUMMARY_PATH = join(OUTPUT_DIR, 'vff-backfill-summary.json')

// ── Types ────────────────────────────────────────────────────────────────────

type Stats = {
  updated: number
  duplicated: number
  skipped: number
  errors: { id: number; campaignId: number; error: string }[]
}

type ElectedOfficeRef = { id: string; campaignId: number }

// ── Batch fetching ───────────────────────────────────────────────────────────

async function fetchNullOrgSlugIds(
  prisma: PrismaClient,
  afterId: number,
  batchSize: number,
): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM voter_file_filter
    WHERE organization_slug IS NULL AND id > ${afterId}
    ORDER BY id
    LIMIT ${batchSize}
  `
  return rows.map((r) => r.id)
}

// ── Batch lookup helpers ─────────────────────────────────────────────────────

async function resolveExistingOrgSlugs(
  prisma: PrismaClient,
  slugs: string[],
): Promise<Set<string>> {
  if (slugs.length === 0) return new Set()
  const orgs = await prisma.organization.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true },
  })
  return new Set(orgs.map((o) => o.slug))
}

async function fetchElectedOfficesByCampaign(
  prisma: PrismaClient,
  campaignIds: number[],
): Promise<Map<number, ElectedOfficeRef[]>> {
  const map = new Map<number, ElectedOfficeRef[]>()
  if (campaignIds.length === 0) return map

  const eos = await prisma.electedOffice.findMany({
    where: { campaignId: { in: campaignIds } },
    select: { id: true, campaignId: true },
  })
  for (const eo of eos) {
    const list = map.get(eo.campaignId) ?? []
    list.push(eo)
    map.set(eo.campaignId, list)
  }
  return map
}

// ── Single-record mutations ──────────────────────────────────────────────────

async function linkFilterToCampaignOrg(
  tx: TransactionClient,
  filterId: number,
  campaignSlug: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE voter_file_filter
    SET organization_slug = ${campaignSlug}, updated_at = NOW()
    WHERE id = ${filterId}
  `
}

async function duplicateFilterForOrg(
  tx: TransactionClient,
  filter: VoterFileFilter,
  orgSlug: string,
): Promise<void> {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } =
    filter
  // organizationSlug exists at runtime but not in stale generated types
  delete (data as Record<string, unknown>).organizationSlug
  const created = await tx.voterFileFilter.create({ data })
  await tx.$executeRaw`
    UPDATE voter_file_filter
    SET organization_slug = ${orgSlug}, updated_at = NOW()
    WHERE id = ${created.id}
  `
}

// ── Per-filter processing ────────────────────────────────────────────────────

async function processFilter(
  prisma: PrismaClient,
  filter: VoterFileFilter,
  campaignOrgSlugs: Set<string>,
  eosByCampaign: Map<number, ElectedOfficeRef[]>,
  eoOrgSlugs: Set<string>,
  stats: Stats,
  detailStream: WriteStream,
): Promise<void> {
  const campaignSlug = `campaign-${filter.campaignId}`

  if (!campaignOrgSlugs.has(campaignSlug)) {
    stats.skipped++
    detailStream.write(
      JSON.stringify({
        id: filter.id,
        campaignId: filter.campaignId,
        action: 'skipped',
        reason: `Organization ${campaignSlug} does not exist`,
      }) + '\n',
    )
    return
  }

  try {
    const eos = eosByCampaign.get(filter.campaignId) ?? []
    const duplicatedTo: Array<string | { slug: string; skipped: string }> = []
    let duplicatedCount = 0

    await prisma.$transaction(async (tx) => {
      await linkFilterToCampaignOrg(tx, filter.id, campaignSlug)

      for (const eo of eos) {
        const eoSlug = `eo-${eo.id}`
        if (!eoOrgSlugs.has(eoSlug)) {
          duplicatedTo.push({ slug: eoSlug, skipped: 'org does not exist' })
          continue
        }
        await duplicateFilterForOrg(tx, filter, eoSlug)
        duplicatedCount++
        duplicatedTo.push(eoSlug)
      }
    })

    stats.updated++
    stats.duplicated += duplicatedCount

    detailStream.write(
      JSON.stringify({
        id: filter.id,
        campaignId: filter.campaignId,
        action: 'updated',
        organizationSlug: campaignSlug,
        duplicatedTo: duplicatedTo.length > 0 ? duplicatedTo : undefined,
      }) + '\n',
    )
  } catch (err) {
    stats.errors.push({
      id: filter.id,
      campaignId: filter.campaignId,
      error: err instanceof Error ? err.message : String(err),
    })
    detailStream.write(
      JSON.stringify({
        id: filter.id,
        campaignId: filter.campaignId,
        action: 'error',
        error: err instanceof Error ? err.message : String(err),
      }) + '\n',
    )
  }
}

// ── Batch processing ─────────────────────────────────────────────────────────

async function processBatch(
  prisma: PrismaClient,
  ids: number[],
  stats: Stats,
  detailStream: WriteStream,
): Promise<void> {
  const filters = await prisma.voterFileFilter.findMany({
    where: { id: { in: ids } },
  })

  const campaignIds = [...new Set(filters.map((f) => f.campaignId))]
  const campaignSlugs = campaignIds.map((cid) => `campaign-${cid}`)

  const eosByCampaign = await fetchElectedOfficesByCampaign(prisma, campaignIds)
  const allEoSlugs = [...eosByCampaign.values()]
    .flat()
    .map((eo) => `eo-${eo.id}`)

  const campaignOrgSlugs = await resolveExistingOrgSlugs(prisma, campaignSlugs)
  const eoOrgSlugs = await resolveExistingOrgSlugs(prisma, allEoSlugs)

  for (const filter of filters) {
    await processFilter(
      prisma,
      filter,
      campaignOrgSlugs,
      eosByCampaign,
      eoOrgSlugs,
      stats,
      detailStream,
    )
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const prisma = new PrismaClient()
  const detailStream = createWriteStream(DETAIL_PATH, { flags: 'w' })
  const stats: Stats = { updated: 0, duplicated: 0, skipped: 0, errors: [] }

  try {
    const startedAt = new Date().toISOString()
    console.log(`Backfill started at ${startedAt}`)
    console.log(`Streaming detail to: ${DETAIL_PATH}\n`)

    let cursor = 0
    while (true) {
      const ids = await fetchNullOrgSlugIds(prisma, cursor, BATCH_SIZE)
      if (ids.length === 0) break
      cursor = ids[ids.length - 1]

      await processBatch(prisma, ids, stats, detailStream)

      console.log(
        `  progress: ${stats.updated} updated, ${stats.duplicated} duplicated, ${stats.skipped} skipped, ${stats.errors.length} errors`,
      )
    }

    const completedAt = new Date().toISOString()
    await writeFile(
      SUMMARY_PATH,
      JSON.stringify(
        {
          startedAt,
          completedAt,
          updated: stats.updated,
          duplicated: stats.duplicated,
          skipped: stats.skipped,
          errors: stats.errors.length,
          errorDetails: stats.errors.slice(0, 50),
        },
        null,
        2,
      ) + '\n',
    )

    console.log(`\nBackfill complete at ${completedAt}`)
    console.log(`Updated: ${stats.updated}`)
    console.log(`Duplicated: ${stats.duplicated}`)
    console.log(`Skipped: ${stats.skipped}`)
    console.log(`Errors: ${stats.errors.length}`)
    if (stats.errors.length > 0) {
      console.log(`First 10 errors:`)
      for (const err of stats.errors.slice(0, 10)) {
        console.log(
          `  VFF ${err.id} (campaign ${err.campaignId}): ${err.error}`,
        )
      }
    }
    console.log(`\nDetail: ${DETAIL_PATH}`)
    console.log(`Summary: ${SUMMARY_PATH}`)
  } finally {
    detailStream.end()
    await new Promise<void>((resolve) => detailStream.on('finish', resolve))
    await prisma.$disconnect()
  }
}

main().catch(async (e) => {
  console.error('Backfill failed:', e)
  process.exit(1)
})
