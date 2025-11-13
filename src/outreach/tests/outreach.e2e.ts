import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'

test.describe.skip('Outreach', () => {
  test('placeholder for TCR compliance tests', async () => {
    expect(HttpStatus.OK).toBe(200)
  })
})
