import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import Stripe from 'stripe'

dotenv.config()

/*
 * One-time script to fix auto-scheduled subscription cancellations.
 *
 * Problem: Previously, the system was automatically scheduling Stripe subscriptions
 * to cancel at election end dates. This behavior was stopped, but 567 existing
 * subscriptions still have scheduled cancellations that need to be removed.
 *
 * This script:
 * 1. Identifies subscriptions with scheduled cancellations
 * 2. Distinguishes between user-initiated cancellations (has comment/feedback)
 *    and auto-scheduled ones (no comment/feedback)
 * 3. Removes the scheduled cancellation from Stripe for auto-scheduled only
 * 4. Updates the database to clear subscriptionCancelAt
 *
 * Run with --live flag to actually make changes, otherwise runs in dry-run mode.
 */

const prisma = new PrismaClient()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string)
const isDryRun = !process.argv.includes('--live')

async function removeAutoCancellations() {
  console.log('Starting subscription cancellation check...')

  const campaigns = await prisma.campaign.findMany({
    where: {
      isPro: true,
    },
    select: {
      id: true,
      slug: true,
      details: true,
    },
  })

  const campaignWithScheduledCancellations = campaigns.filter((campaign) => {
    const details = campaign.details as any
    return details.subscriptionCancelAt && details.subscriptionCancelAt > 0
  })

  console.log(`Found ${campaignWithScheduledCancellations.length} campaigns with scheduled cancellations`)

  let autoCount = 0
  let manualCount = 0

  for (const campaign of campaignWithScheduledCancellations) {
    const { details } = campaign
    const subscriptionId = details.subscriptionId
    if (!subscriptionId) {
      continue
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId)

    if (!subscription.cancel_at) {
      continue // No scheduled cancellation
    }

    const wasUserInitiated = subscription.cancellation_details?.comment != null
      || subscription.cancellation_details?.feedback != null

    if (wasUserInitiated) {
      manualCount++
      console.log(`Manual cancellation for ${campaign.slug} - Reason: ${subscription.cancellation_details?.reason} - Comment: ${subscription.cancellation_details?.comment}`)
    } else {
      autoCount++

      if (isDryRun) {
        console.log(`Dry run: Would have fixed auto-scheduled cancellation for ${campaign.slug}`)
      } else {
        try {
          await stripe.subscriptions.update(subscriptionId, {
            cancel_at: null,
            cancel_at_period_end: false,
          })

          await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
              details: {
                ...(details as any),
                subscriptionCancelAt: null,
                endOfElectionSubscriptionCanceled: false,
              },
            },
          })

          console.log(`✅ Fixed auto-scheduled cancellation for ${campaign.slug}`)
        } catch (error) {
          console.error(`❌ Failed to fix ${campaign.slug}:`, error)
        }

        if (autoCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          console.log(`Processed ${autoCount} auto-scheduled cancellations`)
        }
      }
    }
  }

  console.log(`\nSummary: ${autoCount} auto-scheduled, ${manualCount} manual`)
  if (isDryRun) {
    console.log('\n✨ This was a DRY RUN - no changes were made')
    console.log('Run with --live flag to actually fix the subscriptions')
  } else {
    console.log('\n✅ All auto-scheduled cancellations have been processed')
  }
}

removeAutoCancellations()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

