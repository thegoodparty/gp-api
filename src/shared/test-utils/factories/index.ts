/**
 * Test Factories
 *
 * Reusable factory functions for creating test data across unit tests.
 * These factories provide predictable defaults optimized for testing.
 *
 * @example
 * ```typescript
 * import { userFactory, createProCampaign } from '@/shared/test-utils/factories'
 *
 * const user = userFactory({ email: 'test@example.com' })
 * const campaign = createProCampaign({ userId: user.id })
 * ```
 */

export { generateFactory } from './generate'

export {
  userFactory,
  resetUserCounter,
  createAdminUser,
  createCandidateUser,
  createCampaignManagerUser,
} from './userFactory'

export {
  campaignFactory,
  resetCampaignCounter,
  createProCampaign,
  createCampaignWithUser,
  createVerifiedCampaign,
  createDemoCampaign,
  createCampaignWithFreeTexts,
  createProCampaignWithUser,
} from './campaignFactory'

import { resetUserCounter } from './userFactory'
import { resetCampaignCounter } from './campaignFactory'

/**
 * Resets all factory counters to 1.
 * Call this in beforeEach for complete test isolation without needing to
 * know which individual reset functions exist.
 */
export function resetAllCounters() {
  resetUserCounter()
  resetCampaignCounter()
}
