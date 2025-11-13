import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'

test.describe('Elections', () => {
  test('should get races by zip code', async ({ request }) => {
    const response = await request.get(
      '/v1/elections/races-by-year?level=LOCAL&electionDate=2028-11-15&zipcode=90210',
    )

    expect(response.status()).toBe(HttpStatus.OK)

    const elections = (await response.json()) as {
      id: string
      isPrimary: boolean
      election: { id: string }
      position: { id: string }
    }[]
    expect(Array.isArray(elections)).toBe(true)
    expect(elections.length).toBeGreaterThan(0)

    const firstElection = elections[0]
    expect(firstElection).toHaveProperty('id')
    expect(typeof firstElection.id).toBe('string')
    expect(firstElection).toHaveProperty('isPrimary')
    expect(typeof firstElection.isPrimary).toBe('boolean')
    expect(firstElection).toHaveProperty('election')
    expect(typeof firstElection.election).toBe('object')
    expect(firstElection).toHaveProperty('position')
    expect(typeof firstElection.position).toBe('object')

    expect(firstElection.election).toHaveProperty('id')
    expect(typeof firstElection.election.id).toBe('string')
    expect(firstElection.position).toHaveProperty('id')
    expect(typeof firstElection.position.id).toBe('string')
  })

  test('should get valid district types', async ({ request }) => {
    const response = await request.get(
      '/v1/elections/districts/types?state=TX&electionYear=2025',
    )

    expect(response.status()).toBe(HttpStatus.OK)

    const districtTypes = (await response.json()) as unknown[]
    expect(Array.isArray(districtTypes)).toBe(true)
  })

  test('should get valid district names', async ({ request }) => {
    const response = await request.get(
      '/v1/elections/districts/names?electionYear=2025&state=TX&L2DistrictType=County',
    )

    expect(response.status()).toBe(HttpStatus.OK)

    const districtNames = (await response.json()) as unknown[]
    expect(Array.isArray(districtNames)).toBe(true)
  })
})
