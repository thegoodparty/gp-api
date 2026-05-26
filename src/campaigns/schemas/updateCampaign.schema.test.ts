import { describe, expect, it } from 'vitest'
import { updateCampaignBodySchema } from './updateCampaign.schema'

describe('updateCampaignBodySchema', () => {
  it('accepts legitimate campaign details', () => {
    const result = updateCampaignBodySchema.parse({
      details: { state: 'CA', city: 'Los Angeles' },
    })

    expect(result.details).toEqual({
      state: 'CA',
      city: 'Los Angeles',
    })
  })

  it.each([
    'subscriptionId',
    'subscriptionCanceledAt',
    'subscriptionCancelAt',
    'endOfElectionSubscriptionCanceled',
    'isProUpdatedAt',
    'proUpgradeSlackNotifiedAt',
  ])('strips Stripe-managed field "%s" from details', (field) => {
    const result = updateCampaignBodySchema.parse({
      details: { state: 'CA', [field]: 'injected' },
    })

    expect(result.details).not.toHaveProperty(field)
    expect(result.details).toHaveProperty('state', 'CA')
  })
})
