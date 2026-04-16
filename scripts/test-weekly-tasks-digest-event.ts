/**
 * Test script: Campaign Plan - Weekly Tasks Digest (Segment event)
 *
 * Picks a single campaign, finds its incomplete tasks due in the next
 * Monday-to-Monday window, and fires the "Campaign Plan - Weekly Tasks Digest"
 * Segment event so you can verify the pipeline in Segment Debugger → HubSpot.
 *
 * Usage:
 *   npx tsx scripts/test-weekly-tasks-digest-event.ts --campaign=<ID> [--dry-run]
 *
 * Options:
 *   --campaign=<ID>  Required. The campaign ID to fire the event for.
 *   --dry-run        Print the event payload without sending to Segment.
 *
 * Requires DATABASE_URL and SEGMENT_WRITE_KEY in .env.
 * ONLY reads from the database — never writes.
 */
import 'dotenv/config'
import pg from 'pg'
import Analytics from '@segment/analytics-node'
import { addDays, format, nextMonday, startOfDay } from 'date-fns'

const OUTREACH_FLOW_TYPES = ['text', 'robocall', 'doorKnocking', 'phoneBanking']
const MAX_TASKS = 5

const campaignArg = process.argv.find((a) => a.startsWith('--campaign='))
if (!campaignArg) {
  console.error('Usage: npx tsx scripts/test-weekly-tasks-digest-event.ts --campaign=<ID> [--dry-run]')
  process.exit(1)
}
const CAMPAIGN_ID = parseInt(campaignArg.split('=')[1], 10)
if (isNaN(CAMPAIGN_ID)) {
  throw new Error('--campaign must be a number')
}
const DRY_RUN = process.argv.includes('--dry-run')

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is not set.')
if (!DRY_RUN && !process.env.SEGMENT_WRITE_KEY) {
  throw new Error('SEGMENT_WRITE_KEY is not set (required unless --dry-run).')
}

interface CampaignRow {
  campaign_id: number
  user_id: number
  email: string
  hubspot_id: string | null
  election_date: string | null
}

interface TaskRow {
  id: string
  title: string
  description: string
  flow_type: string | null
  week: number
  date: string | null
  completed: boolean
}

async function main() {
  const db = new pg.Client({ connectionString: databaseUrl })
  await db.connect()

  try {
    const { rows: campaigns } = await db.query<CampaignRow>(`
      SELECT
        c.id AS campaign_id,
        c.user_id,
        u.email,
        u.meta_data->>'hubspotId' AS hubspot_id,
        c.details->>'electionDate' AS election_date
      FROM campaign c
      JOIN "user" u ON u.id = c.user_id
      WHERE c.id = $1
    `, [CAMPAIGN_ID])

    if (campaigns.length === 0) {
      console.error(`Campaign ${CAMPAIGN_ID} not found.`)
      process.exit(1)
    }

    const campaign = campaigns[0]
    console.log(`\nCampaign: ${campaign.campaign_id}`)
    console.log(`User:     ${campaign.email} (id: ${campaign.user_id})`)
    console.log(`HubSpot:  ${campaign.hubspot_id ?? '(none)'}`)
    console.log(`Election: ${campaign.election_date ?? '(none)'}`)

    if (campaign.election_date) {
      const electionDate = new Date(campaign.election_date)
      if (electionDate <= new Date()) {
        console.error(`\nElection date ${campaign.election_date} is in the past — would skip in production.`)
        if (!DRY_RUN) process.exit(1)
        console.log('Continuing anyway because --dry-run...')
      }
    }

    const windowStart = startOfDay(nextMonday(new Date()))
    const windowEnd = addDays(windowStart, 7)

    console.log(`\nTask window: ${windowStart.toISOString().split('T')[0]} → ${windowEnd.toISOString().split('T')[0]}`)

    const { rows: allWindowTasks } = await db.query<TaskRow>(`
      SELECT id, title, description, flow_type, week, date, completed
      FROM campaign_task
      WHERE campaign_id = $1
        AND date >= $2
        AND date < $3
      ORDER BY date ASC
    `, [CAMPAIGN_ID, windowStart, windowEnd])

    const completedCount = allWindowTasks.filter((t) => t.completed).length
    const tasks = allWindowTasks.filter((t) => !t.completed)

    console.log(`Found ${allWindowTasks.length} task(s) in window (${completedCount} completed, ${tasks.length} incomplete)`)

    if (tasks.length < 3) {
      console.log(`\nOnly ${tasks.length} incomplete task(s) — in production, no event would be sent (minimum 3).`)
      process.exit(0)
    }

    for (const t of tasks) {
      console.log(`  [${t.flow_type ?? 'none'}] ${t.title} (week ${t.week}, due ${t.date})`)
    }

    const sorted = [...tasks].sort((a, b) => {
      const aIsOutreach = OUTREACH_FLOW_TYPES.includes(a.flow_type ?? '')
      const bIsOutreach = OUTREACH_FLOW_TYPES.includes(b.flow_type ?? '')
      if (aIsOutreach && !bIsOutreach) return -1
      if (!aIsOutreach && bIsOutreach) return 1
      return 0
    })

    const selected = sorted.slice(0, MAX_TASKS)
    console.log(`\nSelected ${selected.length} task(s) (outreach prioritized):`)
    for (const t of selected) {
      console.log(`  [${t.flow_type ?? 'none'}] ${t.title}`)
    }

    const properties: Record<string, unknown> = {
      email: campaign.email,
      plan_tasks_completed: completedCount,
      plan_total_tasks: allWindowTasks.length,
    }

    // Always emit all 5 slots so HubSpot clears any stale values from prior weeks.
    for (let i = 0; i < MAX_TASKS; i++) {
      const n = i + 1
      const task = selected[i]
      properties[`task_name_${n}`] = task?.title ?? ''
      properties[`task_description_${n}`] = task?.description ?? ''
      properties[`task_type_${n}`] = task?.flow_type ?? ''
      properties[`task_due_date_${n}`] = task?.date ? format(new Date(task.date), 'yyyy-MM-dd') : ''
      properties[`task_week_number_${n}`] = task?.week ?? null
    }

    const eventName = 'Campaign Plan - Weekly Tasks Digest'

    console.log(`\nEvent: "${eventName}"`)
    console.log('Properties:', JSON.stringify(properties, null, 2))

    if (DRY_RUN) {
      console.log('\n--dry-run: Segment event NOT sent.')
      return
    }

    const analytics = new Analytics({ writeKey: process.env.SEGMENT_WRITE_KEY! })

    const traits: Record<string, string> = {}
    if (campaign.email) traits.email = campaign.email
    if (campaign.hubspot_id) traits.hubspotId = campaign.hubspot_id

    analytics.track({
      event: eventName,
      userId: String(campaign.user_id),
      properties,
      context: { traits },
    })

    await analytics.closeAndFlush()
    console.log('\nSegment event sent. Check the Segment Debugger to verify.')
  } finally {
    await db.end()
  }
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
