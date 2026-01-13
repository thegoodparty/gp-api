import { HttpStatus } from '@nestjs/common'
import { expect, test } from '@playwright/test'
import { loginUser } from '../../../e2e-tests/utils/auth.util'

test.describe('Users - File Operations', () => {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  test.beforeAll(() => {
    test.skip(!adminEmail || !adminPassword, 'Admin credentials not configured')
  })

  let authToken: string

  test.beforeEach(async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)
    authToken = token
  })

  test('should generate signed upload URL', async ({ request }) => {
    const response = await request.put(
      '/v1/users/files/generate-signed-upload-url',
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: {
          bucket: 'ein-supporting-documents/test-folder',
          fileName: 'test-file.pdf',
          fileType: 'application/pdf',
        },
      },
    )

    expect(response.status()).toBe(HttpStatus.OK)

    const body = (await response.json()) as { signedUploadUrl: string }
    expect(body).toHaveProperty('signedUploadUrl')
    expect(typeof body.signedUploadUrl).toBe('string')
    expect(body.signedUploadUrl).toContain('s3')
    expect(body.signedUploadUrl).toContain('amazonaws')
  })
})
