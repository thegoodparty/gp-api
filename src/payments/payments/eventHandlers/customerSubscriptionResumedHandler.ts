import { Stripe } from 'stripe'

export async function customerSubscriptionResumedHandler(
  event: Stripe.CustomerSubscriptionResumedEvent,
): Promise<void> {
  const subscription = event.data.object
  console.log('CustomerSubscriptionResumed subscription', subscription)
}
