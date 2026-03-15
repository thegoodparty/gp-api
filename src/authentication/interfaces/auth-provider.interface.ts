export interface VerifiedSession {
  externalUserId: string
}

export interface VerifiedM2MToken {
  id: string
  subject: string
}

export interface AuthUserEventData {
  externalUserId: string
}

export interface AuthProvider {
  verifySessionToken(token: string): Promise<VerifiedSession>
  verifyM2MToken(token: string): Promise<VerifiedM2MToken>
  isM2MToken(token: string): boolean
  getUser(externalUserId: string): Promise<{
    email?: string
    firstName?: string
    lastName?: string
  } | null>
}

export const AUTH_PROVIDER_TOKEN = 'AuthProvider'
export const AUTH_USER_UPDATED_EVENT = 'auth.user.updated'
export const AUTH_USER_DELETED_EVENT = 'auth.user.deleted'
