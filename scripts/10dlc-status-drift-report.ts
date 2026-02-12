/**
 * 10DLC Status Drift Report
 *
 * Compares each pro campaign's 10DLC compliance step (from the database) against
 * the "10 DLC Compliance Status" property in HubSpot, and flags mismatches.
 *
 * Usage:
 *   npx tsx scripts/10dlc-status-drift-report.ts [--limit=N]
 *
 * Options:
 *   --limit=N   Only check the first N campaigns (useful for testing against prod)
 *
 * Requires DATABASE_URL and HUBSPOT_TOKEN in .env.
 * ONLY performs read operations — never writes to HubSpot or the database.
 *
 * Outputs a timestamped CSV to scripts/ (covered by .gitignore via scripts/*.csv).
 */
import 'dotenv/config'
import { writeFileSync } from 'fs'
import pg from 'pg'
import { Client } from '@hubspot/api-client'
import { chunk } from 'es-toolkit'

// --- CLI args ---
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0
if (limitArg && isNaN(LIMIT)) {
  throw new Error('--limit must be a number')
}

// --- Excluded campaigns (approved by campaign success team) ---
// Test accounts, duplicates, and special cases that should not appear in the report.
const EXCLUDED_CAMPAIGN_IDS = [151557, 20, 962, 27835, 117404, 3078, 98823]

// ---------------------------------------------------------------------------
// SQL — fetch all pro campaigns with their user, website, domain, and TCR data.
//
//   campaign  →  user           (campaign.user_id = user.id)
//   campaign  →  website        (website.campaign_id = campaign.id)
//   website   →  domain         (domain.website_id = website.id)
//   campaign  →  tcr_compliance (tcr_compliance.campaign_id = campaign.id)
//
// campaign.data is a JSONB column; data->>'hubspotId' holds the HubSpot
// company ID (record type 0-2) when available.
//
// Only includes campaigns where is_pro = true.
// Also counts how many pro campaigns each user owns so we can flag multiples.
// ---------------------------------------------------------------------------
const SQL = `
  SELECT
    u.email,
    c.id                      AS campaign_id,
    c.slug                    AS campaign_slug,
    c.data->>'hubspotId'      AS hubspot_id,
    c.created_at              AS campaign_created_at,
    c.details->>'electionDate'       AS election_date,
    u.meta_data->>'customerId'       AS stripe_customer_id,
    c.details->>'subscriptionId'     AS stripe_subscription_id,
    w.status                  AS website_status,
    d.status                  AS domain_status,
    tcr.status                AS tcr_status,
    user_counts.campaign_count
  FROM campaign c
  JOIN "user" u ON u.id = c.user_id
  LEFT JOIN website w   ON w.campaign_id = c.id
  LEFT JOIN domain d    ON d.website_id  = w.id
  LEFT JOIN tcr_compliance tcr ON tcr.campaign_id = c.id
  JOIN (
    SELECT user_id, COUNT(*)::int AS campaign_count
    FROM campaign
    WHERE is_pro = true
    GROUP BY user_id
  ) user_counts ON user_counts.user_id = c.user_id
  WHERE c.is_pro = true AND c.is_demo = false
    AND u.email NOT LIKE '%goodparty.org%'
    AND c.id NOT IN (${EXCLUDED_CAMPAIGN_IDS.join(', ')})
  ORDER BY c.id ASC
  ${LIMIT ? `LIMIT ${LIMIT}` : ''}
`

// ---------------------------------------------------------------------------
// DB step → expected HubSpot value mapping
//
// The DB step reflects which compliance stage the campaign is currently at.
// HubSpot tracks which step was last *completed* via Segment events/workflows.
//
//   DB Step (current stage)            HubSpot (last completed event)
//   ─────────────────────────────────  ──────────────────────────────
//   Step 1: Create Website          →  Not Started
//   Step 2: Buy Domain              →  Website Created
//   Step 3: Submit Registration     →  Domain Purchased
//   Step 4: Enter PIN               →  Registration Submitted
//   Completed (Pending Approval)    →  Compliance Pending
//   Fully Approved                  →  Compliant
// ---------------------------------------------------------------------------
const STEP_TO_HUBSPOT: Record<ComplianceStep, string> = {
  'Step 1: Create Website': 'Not Started',
  'Step 2: Buy Domain': 'Website Created',
  'Step 3: Submit Registration': 'Domain Purchased',
  'Step 4: Enter PIN': 'Registration Submitted',
  'Completed (Pending Approval)': 'Compliance Pending',
  'Fully Approved': 'Compliant',
}

const HUBSPOT_ORDER: Record<string, number> = {
  'Not Started': 0,
  'Website Created': 1,
  'Domain Purchased': 2,
  'Registration Submitted': 3,
  'Compliance Pending': 4,
  Compliant: 5,
}

// HubSpot property name for 10DLC compliance status in HubSpot
const HUBSPOT_PROPERTY = 'n10_dlc_compliance_status'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ComplianceStep =
  | 'Step 1: Create Website'
  | 'Step 2: Buy Domain'
  | 'Step 3: Submit Registration'
  | 'Step 4: Enter PIN'
  | 'Completed (Pending Approval)'
  | 'Fully Approved'

type MismatchType =
  | 'OK'
  | 'OK_UNPUBLISHED_WEBSITE'
  | 'BEHIND'
  | 'AHEAD'
  | 'NO_HUBSPOT_ID'
  | 'NOT_FOUND_IN_HUBSPOT'
  | '10_DLC_NOT_SET_IN_HUBSPOT'
  | 'ERROR'

interface DbRow {
  email: string
  campaign_id: number
  campaign_slug: string
  hubspot_id: string | null
  campaign_created_at: Date
  election_date: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  website_status: string | null
  domain_status: string | null
  tcr_status: string | null
  campaign_count: number
}

interface ReportRow {
  email: string
  campaignId: number
  hubspotId: string
  mergedTo: string
  createdAt: string
  electionDate: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  websiteUnpublished: string
  websiteStatus: string
  domainStatus: string
  tcrStatus: string
  dbStep: ComplianceStep
  expectedHS: string
  actualHS: string
  match: MismatchType
  multiCampaign: string
}

// ---------------------------------------------------------------------------
// Step logic — mirrors the webapp's ComplianceSteps.tsx
//
//   Step 1  Create Website       website.status = 'published'
//   Step 2  Buy Domain           domain.status  IN ('submitted','registered','active')
//   Step 3  Submit Registration  tcr.status     IN ('submitted','pending','approved')
//   Step 4  Enter PIN            tcr.status     IN ('pending','approved')
//   Done    Fully Approved       tcr.status     = 'approved'
// ---------------------------------------------------------------------------
function determineStep(
  websiteStatus: string | null,
  domainStatus: string | null,
  tcrStatus: string | null,
): ComplianceStep {
  const websiteComplete = websiteStatus === 'published'
  const domainComplete =
    domainStatus === 'submitted' ||
    domainStatus === 'registered' ||
    domainStatus === 'active'
  const registrationComplete =
    tcrStatus === 'submitted' ||
    tcrStatus === 'pending' ||
    tcrStatus === 'approved'
  const pinComplete = tcrStatus === 'pending' || tcrStatus === 'approved'

  if (tcrStatus === 'approved') return 'Fully Approved'
  if (pinComplete) return 'Completed (Pending Approval)'
  if (registrationComplete && !pinComplete) return 'Step 4: Enter PIN'
  if (websiteComplete && domainComplete) return 'Step 3: Submit Registration'
  if (websiteComplete) return 'Step 2: Buy Domain'
  return 'Step 1: Create Website'
}

// ---------------------------------------------------------------------------
// HubSpot batch lookup (READ only)
//
// campaign.data.hubspotId is a HubSpot *company* ID (record type 0-2).
// The "10 DLC Compliance Status" property is set on companies by HubSpot
// workflows (see src/vendors/segment/HUBSPOT_INTEGRATION.md).
//
// Campaigns without a hubspotId are flagged as NO_HUBSPOT_ID in the report
// so missing IDs are surfaced rather than silently worked around.
//
// Returns a Map keyed by hubspotId → HubSpot compliance status value.
// IDs not found in HubSpot will not be present in the map.
// ---------------------------------------------------------------------------
async function fetchHubSpotStatuses(
  hubspot: Client,
  hubspotIds: string[],
): Promise<Map<string, string | null>> {
  const statusMap = new Map<string, string | null>()
  const batches = chunk(hubspotIds, 100)

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    try {
      const response = await hubspot.crm.companies.batchApi.read({
        properties: [HUBSPOT_PROPERTY],
        propertiesWithHistory: [],
        inputs: batch.map((id) => ({ id })),
      })

      for (const company of response.results) {
        statusMap.set(company.id, company.properties[HUBSPOT_PROPERTY] ?? null)
      }
    } catch (error) {
      console.error(
        `  HubSpot batch ${i + 1}/${batches.length} failed:`,
        error instanceof Error ? error.message : error,
      )
      for (const id of batch) {
        statusMap.set(id, '(error)')
      }
    }

    if (i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }

  return statusMap
}

// ---------------------------------------------------------------------------
// Merge resolution (READ only)
//
// For hubspotIds not found in the batch read (likely merged companies), call
// basicApi.getById() individually. HubSpot transparently resolves old IDs to
// the surviving (winner) record — if the returned id differs from the requested
// one, a merge occurred.
//
// Returns a Map keyed by old hubspotId → { newId, status }.
// ---------------------------------------------------------------------------
interface MergeResult {
  newId: string
  status: string | null
}

interface MergeFailure {
  id: string
  attempts: number
  lastError: string
}

const MAX_RETRIES = 3

async function resolveMergedCompanies(
  hubspot: Client,
  staleIds: string[],
): Promise<{ mergeMap: Map<string, MergeResult>; failures: MergeFailure[] }> {
  const mergeMap = new Map<string, MergeResult>()
  const failures: MergeFailure[] = []

  // Process sequentially to avoid rate limits (HubSpot allows ~19/sec)
  for (let i = 0; i < staleIds.length; i++) {
    const oldId = staleIds[i]
    let lastError = ''

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const company = await hubspot.crm.companies.basicApi.getById(oldId, [
          HUBSPOT_PROPERTY,
          'hs_merged_object_ids',
        ])

        // HubSpot resolves merged IDs to the surviving record.
        // If company.id !== oldId, a merge occurred.
        // If company.id === oldId, the ID exists but wasn't in the batch.
        mergeMap.set(oldId, {
          newId: company.id,
          status: company.properties[HUBSPOT_PROPERTY] ?? null,
        })
        lastError = ''
        break
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)

        // 404 means the ID truly doesn't exist — don't retry
        if (lastError.includes('404') || lastError.includes('Not Found')) {
          lastError = ''
          break
        }

        // On rate limit (429), wait longer before retrying
        const isRateLimit = lastError.includes('429')
        const delay = isRateLimit ? 2000 * attempt : 500 * attempt

        if (attempt < MAX_RETRIES) {
          console.warn(
            `    Retry ${attempt}/${MAX_RETRIES} for ID ${oldId} (${isRateLimit ? 'rate limited' : 'error'}, waiting ${delay}ms)`,
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    if (lastError) {
      failures.push({ id: oldId, attempts: MAX_RETRIES, lastError })
    }

    // Small delay between each call to stay under rate limits
    if (i < staleIds.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  return { mergeMap, failures }
}

// ---------------------------------------------------------------------------
// Mismatch classification
// ---------------------------------------------------------------------------
function classifyMismatch(
  expected: string,
  actual: string | null | undefined,
  hasHubSpotId: boolean,
  found: boolean,
): MismatchType {
  if (!hasHubSpotId) return 'NO_HUBSPOT_ID'
  if (!found) return 'NOT_FOUND_IN_HUBSPOT'
  if (actual === '(error)') return 'ERROR'
  if (actual === null || actual === undefined || actual === '')
    return '10_DLC_NOT_SET_IN_HUBSPOT'
  if (actual === expected) return 'OK'

  const expectedOrder = HUBSPOT_ORDER[expected] ?? -1
  const actualOrder = HUBSPOT_ORDER[actual] ?? -1
  return actualOrder < expectedOrder ? 'BEHIND' : 'AHEAD'
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Check your .env file.')
  }
  if (!process.env.HUBSPOT_TOKEN) {
    throw new Error('HUBSPOT_TOKEN is not set. Check your .env file.')
  }

  // --- Database query ---
  console.log('\nQuerying database for pro campaigns...')
  const dbClient = new pg.Client({ connectionString: databaseUrl })
  await dbClient.connect()

  let dbRows: DbRow[]
  try {
    const result = await dbClient.query<DbRow>(SQL)
    dbRows = result.rows
  } finally {
    await dbClient.end()
  }
  console.log(`  Found ${dbRows.length} pro campaign(s)`)

  // --- Collect unique hubspotIds for HubSpot lookup ---
  const uniqueHubSpotIds = [
    ...new Set(dbRows.map((r) => r.hubspot_id).filter((id) => id !== null)),
  ]

  const campaignsWithHubspotId = dbRows.filter((r) => r.hubspot_id).length
  const campaignsMissingHubspotId = dbRows.filter((r) => !r.hubspot_id).length
  console.log(
    `  ${campaignsWithHubspotId} campaign(s) with hubspotId, ${campaignsMissingHubspotId} campaign(s) missing hubspotId`,
  )

  // --- HubSpot lookup (by ID only) ---
  const hubspot = new Client({ accessToken: process.env.HUBSPOT_TOKEN })
  let hsMap = new Map<string, string | null>()
  if (uniqueHubSpotIds.length > 0) {
    console.log(
      `\nFetching HubSpot statuses (${Math.ceil(uniqueHubSpotIds.length / 100)} batch(es))...`,
    )
    hsMap = await fetchHubSpotStatuses(hubspot, uniqueHubSpotIds)
    console.log(`  ${hsMap.size} company(ies) found in HubSpot`)
  } else {
    console.log(
      '\nNo hubspotIds to look up — all campaigns are missing hubspotId.',
    )
  }

  // --- Resolve merged companies ---
  const notFoundIds = [
    ...new Set(
      dbRows
        .filter((r) => r.hubspot_id && !hsMap.has(r.hubspot_id))
        .map((r) => r.hubspot_id)
        .filter((id) => id !== null),
    ),
  ]

  let mergeMap = new Map<string, MergeResult>()
  let mergeFailures: MergeFailure[] = []
  if (notFoundIds.length > 0) {
    console.log(
      `\nResolving ${notFoundIds.length} missing ID(s) via merge audit...`,
    )
    const mergeResult = await resolveMergedCompanies(hubspot, notFoundIds)
    mergeMap = mergeResult.mergeMap
    mergeFailures = mergeResult.failures
    let mergedCount = 0
    for (const [oldId, result] of mergeMap) {
      if (result.newId !== oldId) mergedCount++
    }
    console.log(
      `  ${mergeMap.size} resolved (${mergedCount} merged, ${mergeMap.size - mergedCount} found directly)`,
    )
    if (mergeResult.failures.length > 0) {
      console.warn(
        `  ⚠ ${mergeResult.failures.length} ID(s) failed after ${MAX_RETRIES} retries`,
      )
    }
  }

  // --- Build report ---
  const report: ReportRow[] = dbRows.map((row) => {
    const email = row.email.toLowerCase()
    const hubspotId = row.hubspot_id ?? null
    const dbStep = determineStep(
      row.website_status,
      row.domain_status,
      row.tcr_status,
    )
    const expected = STEP_TO_HUBSPOT[dbStep]
    const hasHubSpotId = !!hubspotId
    const foundInBatch = hasHubSpotId && hsMap.has(hubspotId)

    let actual: string | null = null
    let mergedTo = ''
    if (foundInBatch) {
      actual = hsMap.get(hubspotId!) ?? null
    } else if (hasHubSpotId && mergeMap.has(hubspotId!)) {
      const merged = mergeMap.get(hubspotId!)!
      actual = merged.status
      if (merged.newId !== hubspotId) {
        mergedTo = merged.newId
      }
    }

    const found = foundInBatch || mergeMap.has(hubspotId ?? '')

    let match = classifyMismatch(expected, actual, hasHubSpotId, found)

    // If the only reason for a mismatch is an unpublished website, treat it
    // as OK_UNPUBLISHED_WEBSITE. We re-run the step check pretending the
    // website is published — if that makes it match, the website is the sole cause.
    const websiteUnpublished =
      row.website_status !== null && row.website_status !== 'published'
    if (websiteUnpublished && match !== 'OK' && found) {
      const stepIfPublished = determineStep(
        'published', // Pretending the website is published.
        row.domain_status,
        row.tcr_status,
      )
      if (
        classifyMismatch(
          STEP_TO_HUBSPOT[stepIfPublished],
          actual,
          hasHubSpotId,
          found,
        ) === 'OK'
      ) {
        // Indicates that the only reason for a mismatch is the unpublished website,
        // which is a semi common thing for candidates to do and we don't really care
        // about their subdomain.goodparty.org website being published.
        match = 'OK_UNPUBLISHED_WEBSITE'
      }
    }

    return {
      email,
      campaignId: row.campaign_id,
      hubspotId: hubspotId ?? '',
      mergedTo,
      createdAt: new Date(row.campaign_created_at).toISOString().split('T')[0],
      electionDate: row.election_date ?? '',
      stripeCustomerId: row.stripe_customer_id ?? '',
      stripeSubscriptionId: row.stripe_subscription_id ?? '',
      websiteUnpublished: websiteUnpublished ? 'YES' : '',
      websiteStatus: row.website_status ?? '(none)',
      domainStatus: row.domain_status ?? '(none)',
      tcrStatus: row.tcr_status ?? '(none)',
      dbStep,
      expectedHS: expected,
      actualHS: actual ?? '(not set)',
      match,
      multiCampaign:
        row.campaign_count > 1 ? `YES (${row.campaign_count})` : '',
    }
  })

  // --- Summary (all counts are per campaign row) ---
  const mismatches = report.filter(
    (r) => r.match !== 'OK' && r.match !== 'OK_UNPUBLISHED_WEBSITE',
  )
  const withId = report.filter((r) => r.hubspotId).length
  const noId = report.filter((r) => r.match === 'NO_HUBSPOT_ID').length
  const resolvedViaMerge = report.filter((r) => r.mergedTo !== '').length
  const idNotFound = report.filter(
    (r) => r.match === 'NOT_FOUND_IN_HUBSPOT',
  ).length
  const foundInHS = withId - idNotFound - resolvedViaMerge

  console.log('\n══════════════════════════════════════════')
  console.log('  10DLC Compliance Mismatch Report')
  console.log('══════════════════════════════════════════')
  console.log(`  Total pro campaigns:        ${report.length}`)
  console.log(`  With hubspotId:             ${withId}`)
  console.log(`  Found in HubSpot:           ${foundInHS}`)
  console.log(`  Resolved via merge audit:   ${resolvedViaMerge}`)
  console.log(`  Missing hubspotId:          ${noId}`)
  console.log(`  Not found in HubSpot:       ${idNotFound}`)
  console.log(`  Mismatches:                 ${mismatches.length}`)

  const stepCounts = new Map<string, number>()
  for (const row of report) {
    stepCounts.set(row.dbStep, (stepCounts.get(row.dbStep) ?? 0) + 1)
  }
  console.log('\n  --- By DB Step ---')
  for (const [step, count] of stepCounts) {
    console.log(`    ${step}: ${count}`)
  }

  const matchCounts = new Map<string, number>()
  for (const row of report) {
    matchCounts.set(row.match, (matchCounts.get(row.match) ?? 0) + 1)
  }
  console.log('\n  --- By Match Status ---')
  for (const [status, count] of matchCounts) {
    console.log(`    ${status}: ${count}`)
  }

  // --- Mismatch table ---
  if (mismatches.length > 0) {
    console.log('\n── Mismatches ─────────────────────────────')
    console.table(mismatches)
  } else {
    console.log('\n  No mismatches found — all statuses are in sync.')
  }

  // --- CSV export (full data lives here — no need to dump all rows to stdout) ---
  const headers: (keyof ReportRow)[] = [
    'email',
    'campaignId',
    'hubspotId',
    'mergedTo',
    'createdAt',
    'electionDate',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'websiteUnpublished',
    'websiteStatus',
    'domainStatus',
    'tcrStatus',
    'dbStep',
    'expectedHS',
    'actualHS',
    'match',
    'multiCampaign',
  ]
  const csvRows = [
    headers.join(','),
    ...report.map((r) =>
      headers.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(','),
    ),
  ]
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const csvPath = `scripts/10dlc-status-drift-report-${timestamp}.csv`
  writeFileSync(csvPath, csvRows.join('\n'))
  console.log(`\nCSV saved to ${csvPath}`)

  // --- HubSpot API failures report ---
  if (mergeFailures.length > 0) {
    console.log('\n══════════════════════════════════════════')
    console.log('  HubSpot API Failures (after retries)')
    console.log('══════════════════════════════════════════')
    console.log(
      `  ${mergeFailures.length} ID(s) failed after ${MAX_RETRIES} retries each.`,
    )
    console.log(
      '  These are marked NOT_FOUND_IN_HUBSPOT but may exist — re-run to retry.\n',
    )
    console.table(
      mergeFailures.map((f) => ({
        hubspotId: f.id,
        attempts: f.attempts,
        lastError: f.lastError.split('\n')[0],
      })),
    )
  }
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
