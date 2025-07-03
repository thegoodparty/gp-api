export enum WebhookEventType {
  CheckoutSessionCompleted = 'checkout.session.completed',
  CheckoutSessionExpired = 'checkout.session.expired',
  CustomerSubscriptionCreated = 'customer.subscription.created',
  CustomerSubscriptionDeleted = 'customer.subscription.deleted',
  CustomerSubscriptionUpdated = 'customer.subscription.updated',
  CustomerSubscriptionResumed = 'customer.subscription.resumed',
}

export enum PaymentType {
  DOMAIN_REGISTRATION = 'domain_registration',
}

export type PaymentIntentPayload<T extends PaymentType> = {
  type: T
  /**
   * The amount to charge the user in cents
   */
  amount: number
  /**
   * The description of the payment
   */
  description?: string
} & (T extends PaymentType.DOMAIN_REGISTRATION
  ? {
      // type specific metadata to send along with the payment intent
      domainName: string
      domainId: number
    }
  : never)
