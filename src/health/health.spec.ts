import { test, describe } from 'node:test'
import assert from 'node:assert'
import { useTestService } from '../test-utils'

describe('Health API (Integration)', () => {
  const service = useTestService()

  describe('GET /v1/health', () => {
    test('should return OK when service is healthy', async () => {
      const response = await service.client.get('/v1/health')

      console.log(
        'SWAIN RESPONSE: ',
        response.status,
        JSON.stringify(response.data, null, 2),
      )

      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.data, 'OK')
    })
  })
})
