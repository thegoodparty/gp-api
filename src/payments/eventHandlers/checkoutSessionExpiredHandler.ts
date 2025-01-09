import { Stripe } from 'stripe'

export async function checkoutSessionExpiredHandler(
  event: Stripe.CheckoutSessionExpiredEvent,
): Promise<void> {
  const session = event.data.object
  console.log('CheckoutSessionExpired session', session)
}
