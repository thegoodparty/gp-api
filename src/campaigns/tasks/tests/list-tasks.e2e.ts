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

test.describe('Campaigns Tasks - List Tasks', () => {
  let reg: RegisterResponse

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

  test('should list all tasks', async ({ request }) => {
    const response = await request.get('/v1/campaigns/tasks', {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
    })

    expect(response.status()).toBe(200)

    const tasks = (await response.json()) as CampaignTask[]
    expect(Array.isArray(tasks)).toBe(true)
    expect(tasks.length).toBeGreaterThan(0)

    const ids = new Set(tasks.map((t) => t.id))
    expect(ids.size).toBe(tasks.length)
  })

  test('should return tasks with valid structure', async ({ request }) => {
    const response = await request.get('/v1/campaigns/tasks', {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
    })

    expect(response.status()).toBe(200)

    const tasks = (await response.json()) as CampaignTask[]
    expect(tasks.length).toBeGreaterThan(0)

    for (const task of tasks) {
      expect(task.id).toBeDefined()
      expect(task.title).toBeDefined()
      expect(task.week).toBeDefined()
      expect(typeof task.week).toBe('number')
      expect(task.flowType).toBeDefined()
    }
  })

  test('should return tasks ordered by week descending', async ({
    request,
  }) => {
    const response = await request.get('/v1/campaigns/tasks', {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
    })

    expect(response.status()).toBe(200)

    const tasks = (await response.json()) as CampaignTask[]
    expect(tasks.length).toBeGreaterThan(0)

    for (let i = 1; i < tasks.length; i++) {
      expect(tasks[i - 1].week).toBeGreaterThanOrEqual(tasks[i].week)
    }
  })

  test('should return default tasks with isDefaultTask flag', async ({
    request,
  }) => {
    const response = await request.get('/v1/campaigns/tasks', {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
    })

    expect(response.status()).toBe(200)

    const tasks = (await response.json()) as CampaignTask[]
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.some((task) => task.isDefaultTask === true)).toBe(true)
  })

  test('should return unique task ids', async ({ request }) => {
    const response = await request.get('/v1/campaigns/tasks', {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
    })

    expect(response.status()).toBe(200)

    const tasks = (await response.json()) as CampaignTask[]
    const ids = new Set(tasks.map((t) => t.id))
    expect(ids.size).toBe(tasks.length)
  })

  test('should ignore date query params and return all tasks', async ({
    request,
  }) => {
    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-04-01T21:17:31.648Z'

    const allResponse = await request.get('/v1/campaigns/tasks', {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
    })

    const filteredResponse = await request.get(
      `/v1/campaigns/tasks?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    expect(allResponse.status()).toBe(200)
    expect(filteredResponse.status()).toBe(200)

    const allTasks = (await allResponse.json()) as CampaignTask[]
    const filteredTasks = (await filteredResponse.json()) as CampaignTask[]

    expect(allTasks.length).toBe(filteredTasks.length)
  })
})
