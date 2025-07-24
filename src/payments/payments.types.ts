export enum WebhookEventType {
  CheckoutSessionCompleted = 'checkout.session.completed',
  CheckoutSessionExpired = 'checkout.session.expired',
  CustomerSubscriptionCreated = 'customer.subscription.created',
  CustomerSubscriptionDeleted = 'customer.subscription.deleted',
  CustomerSubscriptionUpdated = 'customer.subscription.updated',
  CustomerSubscriptionResumed = 'customer.subscription.resumed',
}

export enum PaymentStatus {
  REQUIRES_PAYMENT_METHOD = 'requires_payment_method',
  REQUIRES_CONFIRMATION = 'requires_confirmation',
  REQUIRES_ACTION = 'requires_action',
  PROCESSING = 'processing',
  REQUIRES_CAPTURE = 'requires_capture',
  CANCELED = 'canceled',
  SUCCEEDED = 'succeeded',
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
  description?: string
} & (T extends PaymentType.DOMAIN_REGISTRATION
  ? {
      domainName: string
      domainId?: number
    }
  : never)
