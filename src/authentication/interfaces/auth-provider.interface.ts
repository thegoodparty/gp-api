export interface VerifiedSession {
  externalUserId: string
  actor?: { sub: string }
}

export interface VerifiedM2MToken {
  id: string
  subject: string
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
