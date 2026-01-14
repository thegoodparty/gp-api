import { useTestService } from '@/test-service'
import { Poll } from '@prisma/client'
import { beforeEach, describe, expect, test } from 'vitest'

const service = useTestService()

beforeEach(async () => {
  await service.prisma.campaign.create({
    data: {
      userId: service.user.id,
      slug: 'test-campaign',
    },
  })
})

describe('POST /polls/initial-poll', () => {
  test.each([
    { message: '', swornInDate: '2025-01-01' },
    { message: '', swornInDate: '2025-01-01' },
  ])('blocks bad input', async (payload) => {
    const result = await service.client.post('/v1/polls/initial-poll', payload)
    expect(result).toMatchObject({
      status: 400,
      data: { message: 'Validation failed' },
    })
  })

  test('creates a poll', async () => {
    const result = await service.client.post('/v1/polls/initial-poll', {
      message: 'This is a test message',
      swornInDate: '2025-01-01',
    })

    expect(result).toMatchObject({
      status: 201,
      data: {
        id: expect.any(String),
      },
    })

    // Appears in list
    const fetched = await service.client.get<{ results: Poll[] }>(`/v1/polls`)
    expect(fetched.data.results).toContainEqual(
      expect.objectContaining({ id: result.data.id }),
    )

    // Can be fetched by ID
    const fetchedById = await service.client.get(`/v1/polls/${result.data.id}`)
    expect(fetchedById).toMatchObject({
      status: 200,
      data: result.data,
    })
  })
})
