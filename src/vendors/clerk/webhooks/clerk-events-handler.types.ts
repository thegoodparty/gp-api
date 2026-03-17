export const CLERK_EVENT_USER_UPDATED = 'user.updated'
export const CLERK_EVENT_USER_DELETED = 'user.deleted'

export type ClerkEventsHandlerEventType =
  | typeof CLERK_EVENT_USER_UPDATED
  | typeof CLERK_EVENT_USER_DELETED

export interface ClerkEmailAddress {
  email_address: string
  id: string
}

export interface ClerkEventsHandlerEventData {
  id: string
  email_addresses?: ClerkEmailAddress[]
  primary_email_address_id?: string | null
  first_name?: string | null
  last_name?: string | null
  image_url?: string | null
}

export interface ClerkEventsHandlerPayload {
  type: ClerkEventsHandlerEventType | string
  data: ClerkEventsHandlerEventData
}
