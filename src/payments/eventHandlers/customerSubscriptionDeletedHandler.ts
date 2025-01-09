import { Stripe } from 'stripe'

export async function customerSubscriptionDeletedHandler(
  event: Stripe.CustomerSubscriptionDeletedEvent,
): Promise<void> {
  const subscription = event.data.object
  console.log('CustomerSubscriptionDeleted subscription', subscription)
}
