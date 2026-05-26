import { describe, expect, it } from 'vitest'
import { UpdateMetadataSchema } from './UpdateMetadata.schema'

describe('UpdateMetadataSchema', () => {
  it('accepts legitimate metadata fields', () => {
    const result = UpdateMetadataSchema.create({
      meta: { lastVisited: 1700000000, sessionCount: 5 },
    })

    expect(result.meta).toEqual({
      lastVisited: 1700000000,
      sessionCount: 5,
    })
  })

  it('strips customerId from metadata updates', () => {
    const result = UpdateMetadataSchema.create({
      meta: {
        lastVisited: 1700000000,
        customerId: 'cus_VICTIM',
      },
    })

    expect(result.meta).not.toHaveProperty('customerId')
    expect(result.meta).toHaveProperty('lastVisited', 1700000000)
  })

  it('strips checkoutSessionId from metadata updates', () => {
    const result = UpdateMetadataSchema.create({
      meta: {
        lastVisited: 1700000000,
        checkoutSessionId: 'cs_VICTIM',
      },
    })

    expect(result.meta).not.toHaveProperty('checkoutSessionId')
    expect(result.meta).toHaveProperty('lastVisited', 1700000000)
  })
})
