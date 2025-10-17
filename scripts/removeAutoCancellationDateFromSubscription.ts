import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import Stripe from 'stripe'

dotenv.config()

const prisma = new PrismaClient()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string)

async function removeAutoCancellations() {
  console.log('Starting subscription cancellation check...')

  // TODO: Fetch campaigns from database
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

    const wasUserInitiated = subscription.customer_portal_data?.cancellation_reason !== null

    if (wasUserInitiated) {
      manualCount++
      console.log(`Manual cancellation for ${campaign.slug} - Reason: ${subscription.customer_portal_data?.cancellation_reason}`)
    } else {
      autoCount++
      // Auto-scheduled - we'll fix these
    }
  }

  console.log(`\nSummary: ${autoCount} auto-scheduled, ${manualCount} manual`)
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

