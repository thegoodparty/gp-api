import { test, expect } from '@playwright/test'
import { loginUser } from '../../../../e2e-tests/utils/auth.util'

interface Task {
  id: string
  week: number
  completed: boolean
}

test.describe('Campaigns Tasks - Complete Tasks', () => {
  const candidateEmail = process.env.CANDIDATE_EMAIL
  const candidatePassword = process.env.CANDIDATE_PASSWORD
  let testTaskId: string

  test.beforeAll(() => {
    test.skip(
      !candidateEmail || !candidatePassword,
      'Candidate credentials not configured',
    )
  })

  test('should complete a task', async ({ request }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-04-13T21:17:31.648Z'

    const listResponse = await request.get(
      `/v1/campaigns/tasks?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    const tasks = (await listResponse.json()) as Task[]
    testTaskId = tasks[0].id

    const response = await request.put(
      `/v1/campaigns/tasks/complete/${testTaskId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const updatedTask = (await response.json()) as Task
    expect(updatedTask.id).toBe(testTaskId)
    expect(updatedTask.completed).toBe(true)
  })

  test('should uncomplete a task', async ({ request }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-04-13T21:17:31.648Z'

    const listResponse = await request.get(
      `/v1/campaigns/tasks?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    const tasks = (await listResponse.json()) as Task[]
    testTaskId = tasks[0].id

    await request.put(`/v1/campaigns/tasks/complete/${testTaskId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const response = await request.delete(
      `/v1/campaigns/tasks/complete/${testTaskId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const updatedTask = (await response.json()) as Task
    expect(updatedTask.id).toBe(testTaskId)
    expect(updatedTask.completed).toBe(false)
  })
})

