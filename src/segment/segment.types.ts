export const EVENTS = {
  Account: {
    PasswordResetRequested: 'Account - Password Reset Requested',
    ProSubscriptionConfirmed: 'Account - Pro Subscription Confirmed',
  },
  Onboarding: {
    UserCreated: 'Onboarding - User Created',
  },
}

export interface SegmentProperties {
  officeMunicipality?: string
  officeName?: string
  officeElectionDate?: string
  affiliation?: string
  pledged?: boolean
}
