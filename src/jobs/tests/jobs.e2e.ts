import { HttpStatus } from '@nestjs/common'
import { expect, test } from '@playwright/test'

test.describe('Jobs (Ashby)', () => {
  let jobId: string

  test('should get all jobs', async ({ request }) => {
    const response = await request.get('/v1/jobs')

    expect(response.status()).toBe(HttpStatus.OK)

    const jobs = (await response.json()) as { id: string }[]
    expect(Array.isArray(jobs)).toBe(true)

    if (jobs.length > 0) {
      jobId = jobs[0].id
      expect(jobId).toBeDefined()
    }
  })

  test('should get a specific job by ID', async ({ request }) => {
    const getAllResponse = await request.get('/v1/jobs')
    const jobs = (await getAllResponse.json()) as { id: string }[]

    if (jobs.length === 0) {
      test.skip()
      return
    }

    const testJobId = jobs[0].id

    const response = await request.get(`/v1/jobs/${testJobId}`)

    expect(response.status()).toBe(HttpStatus.OK)

    const job = (await response.json()) as { id: string }
    expect(job).toHaveProperty('id')
    expect(job.id).toBe(testJobId)
  })

  test('should return 404 for non-existent job ID', async ({ request }) => {
    const response = await request.get('/v1/jobs/bad_id')

    expect(response.status()).toBe(HttpStatus.NOT_FOUND)
  })
})
