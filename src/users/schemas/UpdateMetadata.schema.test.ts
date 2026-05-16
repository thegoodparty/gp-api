import { describe, expect, it } from 'vitest'
import { UpdateMetadataSchema } from './UpdateMetadata.schema'

describe('UpdateMetadataSchema', () => {
  it('accepts user-writable fields', () => {
    expect(() =>
      UpdateMetadataSchema.create({
        meta: {
          accountType: 'candidate',
          whyBrowsing: 'considering',
          textNotifications: true,
        },
      }),
    ).not.toThrow()
  })

  it('strips customerId from input', () => {
    const result = UpdateMetadataSchema.create({
      meta: { customerId: 'cus_VICTIM', textNotifications: true },
    })
    expect(result.meta).not.toHaveProperty('customerId')
    expect(result.meta.textNotifications).toBe(true)
  })

  it('strips checkoutSessionId from input', () => {
    const result = UpdateMetadataSchema.create({
      meta: { checkoutSessionId: 'cs_123' },
    })
    expect(result.meta).not.toHaveProperty('checkoutSessionId')
  })

  it('strips hubspotId from input', () => {
    const result = UpdateMetadataSchema.create({
      meta: { hubspotId: 'hub_123' },
    })
    expect(result.meta).not.toHaveProperty('hubspotId')
  })

  it('strips profile_updated_count from input', () => {
    const result = UpdateMetadataSchema.create({
      meta: { profile_updated_count: 99 },
    })
    expect(result.meta).not.toHaveProperty('profile_updated_count')
  })

  it('strips isDeleted from input', () => {
    const result = UpdateMetadataSchema.create({
      meta: { isDeleted: true },
    })
    expect(result.meta).not.toHaveProperty('isDeleted')
  })

  it('strips fsUserId from input', () => {
    const result = UpdateMetadataSchema.create({
      meta: { fsUserId: 'fs_123' },
    })
    expect(result.meta).not.toHaveProperty('fsUserId')
  })

  it('strips lastVisited from input', () => {
    const result = UpdateMetadataSchema.create({
      meta: { lastVisited: 1700000000 },
    })
    expect(result.meta).not.toHaveProperty('lastVisited')
  })

  it('strips sessionCount from input', () => {
    const result = UpdateMetadataSchema.create({
      meta: { sessionCount: 999 },
    })
    expect(result.meta).not.toHaveProperty('sessionCount')
  })
})
