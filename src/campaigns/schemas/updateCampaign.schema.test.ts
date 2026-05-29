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

  it.each(['won', 'lost'])(
    'accepts top-level primaryResult "%s" so the election result persists',
    (primaryResult) => {
      const result = updateCampaignBodySchema.parse({ primaryResult })

      expect(result).toHaveProperty('primaryResult', primaryResult)
    },
  )

  it('accepts null primaryResult so a recorded result can be cleared', () => {
    const result = updateCampaignBodySchema.parse({ primaryResult: null })

    expect(result.primaryResult).toBeNull()
  })

  it('rejects an invalid primaryResult value', () => {
    expect(() =>
      updateCampaignBodySchema.parse({ primaryResult: 'maybe' }),
    ).toThrow()
  })

  it('strips primaryResult from details (it is a top-level column)', () => {
    const result = updateCampaignBodySchema.parse({
      details: { state: 'CA', primaryResult: 'won' },
    })

    expect(result.details).not.toHaveProperty('primaryResult')
  })
})
