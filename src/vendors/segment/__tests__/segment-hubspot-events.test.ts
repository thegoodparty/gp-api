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
  describe('10DLC Compliance Flow Events (Backend)', () => {
    it('should have the correct ComplianceCompleted event name for HubSpot', () => {
      // This event triggers the "Ops - Set 10 DLC Compliance Status to 10 DLC Compliance Complete" workflow
      // which sets the status to "Compliant"
      expect(EVENTS.Outreach.ComplianceCompleted).toBe(
        'Voter Outreach - 10DLC Compliance Completed',
      )
    })
  })
})
