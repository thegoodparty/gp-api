import { test, expect } from '@playwright/test'
import {
  authHeaders,
  campaignOrgSlug,
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
  let orgSlug: string
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
    orgSlug = campaignOrgSlug(reg.campaign.id)

    // Trigger the SSE stream to create default tasks.
    // Use native fetch with AbortController — abort after 5s which is enough
    // for generateDefaultTasks to complete. Playwright's request API blocks
    // until the full SSE response, which hangs for the Lambda poll timeout.
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000'
    const headers = authHeaders(reg.token, orgSlug)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetch(`${baseUrl}${TASKS_BASE_PATH}/generate/stream`, {
        headers: { ...headers, Accept: 'text/event-stream' },
        signal: controller.signal,
      })
      console.log('SSE response status:', res.status)
    } catch (err) {
      console.log(
        'SSE fetch error:',
        (err as Error).name,
        (err as Error).message,
      )
    }
    clearTimeout(timeout)

    // Poll until default tasks are available
    await expect
      .poll(
        async () => {
          const response = await request.get(TASKS_BASE_PATH, {
            headers: authHeaders(reg.token, orgSlug),
          })
          const tasks = (await response.json()) as CampaignTask[]
          console.log(
            'Poll: status=',
            response.status(),
            'tasks=',
            tasks.length,
            'campaignId=',
            reg.campaign.id,
          )
          return tasks.length
        },
        { timeout: 30_000, intervals: [1_000] },
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
        headers: authHeaders(reg.token, orgSlug),
      },
    )

    const tasks = (await listResponse.json()) as CampaignTask[]
    testTaskId = tasks[0].id!

    const response = await request.put(
      `${TASKS_BASE_PATH}/complete/${testTaskId}`,
      {
        headers: authHeaders(reg.token, orgSlug),
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
        headers: authHeaders(reg.token, orgSlug),
      },
    )

    const tasks = (await listResponse.json()) as CampaignTask[]
    testTaskId = tasks[0].id!

    await request.put(`${TASKS_BASE_PATH}/complete/${testTaskId}`, {
      headers: authHeaders(reg.token, orgSlug),
    })

    const response = await request.delete(
      `${TASKS_BASE_PATH}/complete/${testTaskId}`,
      {
        headers: authHeaders(reg.token, orgSlug),
      },
    )

    expect(response.status()).toBe(200)

    const updatedTask = (await response.json()) as CampaignTaskWithCompletion
    expect(updatedTask.id).toBe(testTaskId)
    expect(updatedTask.completed).toBe(false)
  })
})
