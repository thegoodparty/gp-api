import { HttpStatus } from '@nestjs/common'
import { expect, test } from '@playwright/test'

test.describe('CRM - Integrations', () => {
  test('should handle HubSpot webhook', async ({ request }) => {
    const response = await request.post('/v1/crm/hubspot-webhook', {
      data: {
        appId: 1641594,
        eventId: 100,
        subscriptionId: 2758413,
        portalId: 21589597,
        occurredAt: 1738623985773,
        subscriptionType: 'company.propertyChange',
        attemptNumber: 0,
        objectId: 123,
        changeSource: 'CRM',
        propertyName: 'incumbent',
        propertyValue: 'sample-value',
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)
  })
})
