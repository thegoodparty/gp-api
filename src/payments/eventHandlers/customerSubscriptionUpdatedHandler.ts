import { Stripe } from 'stripe'

export async function customerSubscriptionUpdatedHandler(
  event: Stripe.CustomerSubscriptionUpdatedEvent,
): Promise<void> {
  const subscription = event.data.object
  console.log('CustomerSubscriptionUpdated subscription', subscription)
}
