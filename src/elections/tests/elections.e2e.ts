import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'

test.describe('Elections', () => {
  test('should get races by zip code', async ({ request }) => {
    const response = await request.get(
      '/v1/elections/races-by-year?level=LOCAL&electionDate=2028-11-15&zipcode=90210',
    )

    expect(response.status()).toBe(HttpStatus.OK)

    const races = (await response.json()) as {
      id: string
      brPositionId: string
      election: { electionDay: string }
      position: { name: string; level: string; state: string }
    }[]
    expect(Array.isArray(races)).toBe(true)
    expect(races.length).toBeGreaterThan(0)

    const firstRace = races[0]
    expect(typeof firstRace.id).toBe('string')
    expect(typeof firstRace.brPositionId).toBe('string')
    expect(typeof firstRace.election.electionDay).toBe('string')
    expect(typeof firstRace.position.name).toBe('string')
    expect(typeof firstRace.position.level).toBe('string')
    expect(typeof firstRace.position.state).toBe('string')
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
