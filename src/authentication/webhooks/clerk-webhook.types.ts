export interface ClerkEmailAddress {
  email_address: string
  id: string
}

export interface ClerkWebhookEventData {
  id: string
  email_addresses?: ClerkEmailAddress[]
  first_name?: string | null
  last_name?: string | null
}

export interface ClerkWebhookPayload {
  type: string
  data: ClerkWebhookEventData
}
