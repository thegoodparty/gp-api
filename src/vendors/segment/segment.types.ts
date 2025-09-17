export const EVENTS = {
  Account: {
    PasswordResetRequested: 'Account - Password Reset Requested',
    ProSubscriptionConfirmed: 'Account - Pro Subscription Confirmed',
  },
  Onboarding: {
    UserCreated: 'Onboarding - User Created',
  },
  Outreach: {
    ComplianceCompleted: 'Voter Outreach - 10DLC Compliance Completed',
    FreeTextsOfferRedeemed: 'Voter Outreach - Free Texts Offer Redeemed',
  },
  AiContent: {
    GenerationStarted: 'Content Builder: Generation Started',
    ContentGenerated: 'Content Builder: Generation Completed',
  },
}

// TODO: Define event properties w/ a generic type. No reason this has to be a
//  Record<string, unknown>
//  https://goodparty.atlassian.net/browse/WEB-4530
export type SegmentTrackEventProperties = Record<string, unknown>

// TODO: same here, we should define the traits for the identity profile. No need
//  for a generic type here and should need Record<string, unknown>
//  https://goodparty.atlassian.net/browse/WEB-4530
export type SegmentIdentityTraits = Record<string, unknown>
