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

    const tasksByWeek = tasks.reduce(
      (acc, task) => {
        if (!acc[task.week]) acc[task.week] = []
        acc[task.week].push(task)
        return acc
      },
      {} as Record<number, CampaignTask[]>,
    )

    const expectedWeeks = [1, 2, 3, 4, 5, 6, 7, 8]
    for (const week of expectedWeeks) {
      expect(tasksByWeek[week]?.length).toBeGreaterThan(0)
    }

    const ids = new Set(tasks.map((t) => t.id))
    expect(ids.size).toBe(tasks.length)
  })

  test('should list tasks for week 1', async ({ request }) => {
    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-04-01T21:17:31.648Z'

    const response = await request.get(
      `/v1/campaigns/tasks?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const tasks = (await response.json()) as CampaignTask[]
    expect(tasks.every((task) => task.week === 1)).toBe(true)

    const ids = new Set(tasks.map((t) => t.id))
    expect(ids.size).toBe(tasks.length)
  })

  test('should list tasks for week 2 date range', async ({ request }) => {
    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-04-06T21:17:31.648Z'

    const response = await request.get(
      `/v1/campaigns/tasks?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const tasks = (await response.json()) as CampaignTask[]
    expect(Array.isArray(tasks)).toBe(true)
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.some((task) => task.week === 1)).toBe(true)

    const ids = new Set(tasks.map((t) => t.id))
    expect(ids.size).toBe(tasks.length)
  })

  test('should list tasks for week 3 date range', async ({ request }) => {
    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-04-13T21:17:31.648Z'

    const response = await request.get(
      `/v1/campaigns/tasks?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const tasks = (await response.json()) as CampaignTask[]
    expect(Array.isArray(tasks)).toBe(true)
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.some((task) => task.week === 2)).toBe(true)

    const ids = new Set(tasks.map((t) => t.id))
    expect(ids.size).toBe(tasks.length)
  })

  test('should list tasks for week 4 date range', async ({ request }) => {
    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-04-20T21:17:31.648Z'

    const response = await request.get(
      `/v1/campaigns/tasks?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const tasks = (await response.json()) as CampaignTask[]
    expect(Array.isArray(tasks)).toBe(true)
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.some((task) => task.week === 3)).toBe(true)

    const ids = new Set(tasks.map((t) => t.id))
    expect(ids.size).toBe(tasks.length)
  })

  test('should list tasks for week 5 date range', async ({ request }) => {
    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-04-27T21:17:31.648Z'

    const response = await request.get(
      `/v1/campaigns/tasks?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const tasks = (await response.json()) as CampaignTask[]
    expect(Array.isArray(tasks)).toBe(true)
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.some((task) => task.week === 4)).toBe(true)

    const ids = new Set(tasks.map((t) => t.id))
    expect(ids.size).toBe(tasks.length)
  })

  test('should list tasks for week 7 date range', async ({ request }) => {
    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-05-04T21:17:31.648Z'

    const response = await request.get(
      `/v1/campaigns/tasks?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const tasks = (await response.json()) as CampaignTask[]
    expect(Array.isArray(tasks)).toBe(true)
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.some((task) => task.week === 5)).toBe(true)

    const ids = new Set(tasks.map((t) => t.id))
    expect(ids.size).toBe(tasks.length)
  })

  test('should list tasks for week 8 date range', async ({ request }) => {
    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-05-11T21:17:31.648Z'

    const response = await request.get(
      `/v1/campaigns/tasks?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const tasks = (await response.json()) as CampaignTask[]
    expect(Array.isArray(tasks)).toBe(true)
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.some((task) => task.week === 6)).toBe(true)

    const ids = new Set(tasks.map((t) => t.id))
    expect(ids.size).toBe(tasks.length)
  })

  test('should list tasks for extended date range', async ({ request }) => {
    const date = '2025-03-25T21:17:31.648Z'
    const endDate = '2025-05-19T21:17:31.648Z'

    const response = await request.get(
      `/v1/campaigns/tasks?date=${date}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const tasks = (await response.json()) as CampaignTask[]
    expect(Array.isArray(tasks)).toBe(true)
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.some((task) => task.week === 7)).toBe(true)

    const ids = new Set(tasks.map((t) => t.id))
    expect(ids.size).toBe(tasks.length)
  })
})
