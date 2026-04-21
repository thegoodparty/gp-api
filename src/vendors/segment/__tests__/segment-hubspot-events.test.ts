import { describe, expect, it } from 'vitest'
import { EVENTS } from '../segment.types'

/**
 * These tests verify that critical Segment event names match what HubSpot
 * workflows expect. Changing these event names will break the integration.
 *
 * Background:
 * - Segment sends events to HubSpot via the `pe21589597_segment___all_track` custom event
 * - HubSpot workflows trigger based on the `Name` property matching exact event strings
 * - These workflows update the "10 DLC Compliance Status" field on contacts/companies
 *
 * If a test fails:
 * 1. DO NOT simply update the test to match the new event name
 * 2. Check with the team if the HubSpot workflow was also updated
 * 3. Test the full flow manually: App → Segment → HubSpot → Workflow triggers
 *
 * @see ../HUBSPOT_INTEGRATION.md for full event → workflow mappings
 */
describe('Segment → HubSpot Event Names', () => {
  describe('10DLC Compliance Flow Events', () => {
    it('should have the correct Published event name for HubSpot', () => {
      expect(EVENTS.CandidateWebsite.Published).toBe(
        'Candidate Website - Published',
      )
    })

    it('should have the correct PurchasedDomain event name for HubSpot', () => {
      expect(EVENTS.CandidateWebsite.PurchasedDomain).toBe(
        'Candidate Website - Purchased domain',
      )
    })

    it('should have the correct ComplianceFormSubmitted event name for HubSpot', () => {
      expect(EVENTS.Outreach.ComplianceFormSubmitted).toBe(
        'Voter Outreach - 10DLC Compliance Form Submitted',
      )
    })

    it('should have the correct CompliancePinSubmitted event name for HubSpot', () => {
      expect(EVENTS.Outreach.CompliancePinSubmitted).toBe(
        'Voter Outreach - 10DLC Compliance PIN Submitted',
      )
    })

    it('should have the correct ComplianceCompleted event name for HubSpot', () => {
      expect(EVENTS.Outreach.ComplianceCompleted).toBe(
        'Voter Outreach - 10DLC Compliance Completed',
      )
    })
  })

  describe('Campaign Plan Events', () => {
    it('should have the correct WeeklyTasksDigest event name for HubSpot', () => {
      expect(EVENTS.CampaignPlan.WeeklyTasksDigest).toBe(
        'Campaign Plan - Weekly Tasks Digest',
      )
    })
  })
})
