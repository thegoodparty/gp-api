export const CLERK_EVENT_USER_UPDATED = 'user.updated'
export const CLERK_EVENT_USER_DELETED = 'user.deleted'

export type ClerkWebhookEventType =
  | typeof CLERK_EVENT_USER_UPDATED
  | typeof CLERK_EVENT_USER_DELETED

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
  type: ClerkWebhookEventType | string
  data: ClerkWebhookEventData
}
