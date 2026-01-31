/**
 * ⚠️  HUBSPOT INTEGRATION WARNING - USE CAUTION WHEN EDITING EVENT NAMES ⚠️
 *
 * Many of these event names are used by HubSpot workflows to track user status
 * and trigger email sequences. Changing event names will break the integration.
 *
 * Critical events for 10DLC Compliance flow:
 *   - 'Voter Outreach - 10DLC Compliance Completed' → Sets status to "Compliant"
 *
 * If you need to change an event name:
 * 1. Update the corresponding HubSpot workflow trigger to match
 * 2. Test the full flow: App → Segment → HubSpot → Workflow triggers
 * 3. Verify the affected HubSpot fields update correctly
 *
 */
export const EVENTS = {
  Account: {
    PasswordResetRequested: 'Account - Password Reset Requested',
    ProSubscriptionConfirmed: 'Account - Pro Subscription Confirmed',
  },
  Onboarding: {
    UserCreated: 'Onboarding - User Created',
  },
  //  ⚠️  DO NOT MODIFY - Used by HubSpot workflows for 10DLC compliance tracking
  // Used in: https://app.hubspot.com/workflows/21589597/platform/flow/1739287110/edit
  Outreach: {
    ComplianceCompleted: 'Voter Outreach - 10DLC Compliance Completed',
    FreeTextsOfferRedeemed: 'Voter Outreach - Free Texts Offer Redeemed',
    CampaignVerifyTokenStatusUpdate: 'Campaign Verify Token Status Update',
  },
  AiContent: {
    GenerationStarted: 'Content Builder: Generation Started',
    ContentGenerated: 'Content Builder: Generation Completed',
  },
  Polls: {
    ResultsSynthesisCompleted: 'Poll - Results Synthesis Complete',
  },
}

export type UserContext = {
  email?: string
  hubspotId?: string
}

// TODO: Define event properties w/ a generic type. No reason this has to be a
//  Record<string, unknown>
//  https://goodparty.atlassian.net/browse/WEB-4530
export type SegmentTrackEventProperties = Record<string, unknown>

// TODO: same here, we should define the traits for the identity profile. No need
//  for a generic type here and should need Record<string, unknown>
//  https://goodparty.atlassian.net/browse/WEB-4530
export type SegmentIdentityTraits = Record<string, unknown>
