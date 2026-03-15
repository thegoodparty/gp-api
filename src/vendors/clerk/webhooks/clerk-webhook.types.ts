export interface ClerkEmailAddress {
  email_address: string
  id: string
}

export interface ClerkWebhookEventData {
  id: string
  email_addresses?: ClerkEmailAddress[]
  primary_email_address_id?: string | null
  first_name?: string | null
  last_name?: string | null
}

export interface ClerkWebhookPayload {
  type: string
  data: ClerkWebhookEventData
}
