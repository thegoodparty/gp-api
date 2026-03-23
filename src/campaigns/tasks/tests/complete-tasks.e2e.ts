import { test, expect } from '@playwright/test'
import {
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  registerUser,
  RegisterResponse,
} from '../../../../e2e-tests/utils/auth.util'
import { CampaignTask } from '../campaignTasks.types'

type CampaignTaskWithCompletion = CampaignTask & { completed: boolean }

test.describe('Campaigns Tasks - Complete Tasks', () => {
  let reg: RegisterResponse
  let testTaskId: string

  test.beforeAll(async ({ request }) => {
    reg = await registerUser(request, {
      firstName: generateRandomName(),
      lastName: generateRandomName(),
      email: generateRandomEmail(),
      password: generateRandomPassword(),
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    await request.post('/v1/campaigns/tasks/generate', {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
    })
  })

  test.afterAll(async ({ request }) => {
    if (reg?.user?.id && reg?.token) {
      await deleteUser(request, reg.user.id, reg.token)
    }
  })

  test('should complete a task', async ({ request }) => {
    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-04-13T21:17:31.648Z'

    const listResponse = await request.get(
      `/v1/campaigns/tasks?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    const tasks = (await listResponse.json()) as CampaignTask[]
    testTaskId = tasks[0].id

    const response = await request.put(
      `/v1/campaigns/tasks/complete/${testTaskId}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const updatedTask = (await response.json()) as CampaignTaskWithCompletion
    expect(updatedTask.id).toBe(testTaskId)
    expect(updatedTask.completed).toBe(true)
  })

  test('should uncomplete a task', async ({ request }) => {
    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-04-13T21:17:31.648Z'

    const listResponse = await request.get(
      `/v1/campaigns/tasks?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    const tasks = (await listResponse.json()) as CampaignTask[]
    testTaskId = tasks[0].id

    await request.put(`/v1/campaigns/tasks/complete/${testTaskId}`, {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
    })

    const response = await request.delete(
      `/v1/campaigns/tasks/complete/${testTaskId}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const updatedTask = (await response.json()) as CampaignTaskWithCompletion
    expect(updatedTask.id).toBe(testTaskId)
    expect(updatedTask.completed).toBe(false)
  })
})
