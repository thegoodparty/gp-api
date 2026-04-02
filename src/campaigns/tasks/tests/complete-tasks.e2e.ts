import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  registerUser,
  RegisterResponse,
} from '../../../../e2e-tests/utils/auth.util'
import { CampaignTask } from '../campaignTasks.types'

const TASKS_BASE_PATH = '/v1/campaigns/tasks'

type CampaignTaskWithCompletion = CampaignTask & { completed: boolean }

test.describe('Campaigns Tasks - Complete Tasks', () => {
  let reg: RegisterResponse
  let testTaskId: string

  test.beforeAll(async ({ request }) => {
    test.setTimeout(150_000)
    reg = await registerUser(request, {
      firstName: generateRandomName(),
      lastName: generateRandomName(),
      email: generateRandomEmail(),
      password: generateRandomPassword(),
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    const generateResponse = await request.post(`${TASKS_BASE_PATH}/generate`, {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
    })
    expect(generateResponse.status()).toBe(HttpStatus.ACCEPTED)

    await expect
      .poll(
        async () => {
          const response = await request.get(TASKS_BASE_PATH, {
            headers: {
              Authorization: `Bearer ${reg.token}`,
            },
          })
          expect(response.status()).toBe(HttpStatus.OK)
          const tasks = (await response.json()) as CampaignTask[]
          return tasks.length
        },
        { timeout: 120_000, intervals: [2_000] },
      )
      .toBeGreaterThan(0)
  })

  test.afterAll(async ({ request }) => {
    if (reg?.user?.id && reg?.token) {
      await deleteUser(request, reg.user.id, reg.token)
    }
  })

  test('should complete a task', async ({ request }) => {
    test.setTimeout(90_000)
    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-04-13T21:17:31.648Z'

    const listResponse = await request.get(
      `${TASKS_BASE_PATH}?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    const tasks = (await listResponse.json()) as CampaignTask[]
    testTaskId = tasks[0].id

    const response = await request.put(
      `${TASKS_BASE_PATH}/complete/${testTaskId}`,
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
    test.setTimeout(90_000)
    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-04-13T21:17:31.648Z'

    const listResponse = await request.get(
      `${TASKS_BASE_PATH}?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    const tasks = (await listResponse.json()) as CampaignTask[]
    testTaskId = tasks[0].id

    await request.put(`${TASKS_BASE_PATH}/complete/${testTaskId}`, {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
    })

    const response = await request.delete(
      `${TASKS_BASE_PATH}/complete/${testTaskId}`,
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
