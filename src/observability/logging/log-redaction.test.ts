import { describe, it, expect, vi, beforeEach } from 'vitest'

const loadRedactLine = async (
  secretNames?: string,
  envOverrides?: Record<string, string>,
) => {
  vi.resetModules()

  if (secretNames) {
    process.env.SECRET_NAMES = secretNames
  } else {
    delete process.env.SECRET_NAMES
  }

  if (envOverrides) {
    for (const [key, value] of Object.entries(envOverrides)) {
      process.env[key] = value
    }
  }

  const mod = await import('./log-redaction.js')
  return mod.redactLine
}

const jsonLine = (obj: Record<string, unknown>): string =>
  JSON.stringify(obj) + '\n'

describe('log-redaction', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  describe('secret value redaction', () => {
    it('redacts secret values from top-level keys', async () => {
      const redactLine = await loadRedactLine('API_KEY', {
        API_KEY: 'sk_live_abc123',
      })

      const result = redactLine(
        jsonLine({ token: 'sk_live_abc123', safe: 'hello' }),
      )
      expect(JSON.parse(result)).toEqual({
        token: '[REDACTED]',
        safe: 'hello',
      })
    })

    it('redacts secret values from nested objects', async () => {
      const redactLine = await loadRedactLine('DB_PASSWORD', {
        DB_PASSWORD: 'super-secret-pw',
      })

      const result = redactLine(
        jsonLine({
          config: { connection: { password: 'super-secret-pw' } },
        }),
      )
      expect(JSON.parse(result)).toEqual({
        config: { connection: { password: '[REDACTED]' } },
      })
    })

    it('redacts secret values embedded in strings', async () => {
      const redactLine = await loadRedactLine('API_KEY', {
        API_KEY: 'sk_live_abc123',
      })

      const result = redactLine(
        jsonLine({
          message: 'Failed with key sk_live_abc123 on request',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        message: 'Failed with key [REDACTED] on request',
      })
    })

    it('redacts multiple different secrets', async () => {
      const redactLine = await loadRedactLine('API_KEY,DB_PASSWORD', {
        API_KEY: 'sk_live_abc123',
        DB_PASSWORD: 'p@ssw0rd!',
      })

      const result = redactLine(
        jsonLine({
          key: 'sk_live_abc123',
          pass: 'p@ssw0rd!',
          safe: 'visible',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        key: '[REDACTED]',
        pass: '[REDACTED]',
        safe: 'visible',
      })
    })

    it('redacts multiple occurrences of the same secret', async () => {
      const redactLine = await loadRedactLine('API_KEY', {
        API_KEY: 'secret123',
      })

      const result = redactLine(
        jsonLine({
          field1: 'secret123',
          field2: 'also secret123 here',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        field1: '[REDACTED]',
        field2: 'also [REDACTED] here',
      })
    })

    it('handles secrets with regex special characters', async () => {
      const redactLine = await loadRedactLine('WEBHOOK_SECRET', {
        WEBHOOK_SECRET: 'whsec_abc+def.ghi$123',
      })

      const result = redactLine(jsonLine({ secret: 'whsec_abc+def.ghi$123' }))
      expect(JSON.parse(result)).toEqual({ secret: '[REDACTED]' })
    })

    it('skips secret names that have no env var value', async () => {
      const redactLine = await loadRedactLine('MISSING_KEY,API_KEY', {
        API_KEY: 'real-secret',
      })

      const result = redactLine(
        jsonLine({
          a: 'real-secret',
          b: 'MISSING_KEY',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        a: '[REDACTED]',
        b: 'MISSING_KEY',
      })
    })

    it('redacts values in arrays', async () => {
      const redactLine = await loadRedactLine('TOKEN', {
        TOKEN: 'my-token-value',
      })

      const result = redactLine(
        jsonLine({
          items: ['safe', 'my-token-value', 'also-safe'],
        }),
      )
      expect(JSON.parse(result)).toEqual({
        items: ['safe', '[REDACTED]', 'also-safe'],
      })
    })
  })

  describe('authorization header redaction', () => {
    it('redacts Bearer tokens', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          header:
            'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        header: 'Authorization: Bearer [REDACTED]',
      })
    })

    it('redacts short Bearer tokens', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          header: 'Authorization: Bearer abc123',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        header: 'Authorization: Bearer [REDACTED]',
      })
    })

    it('redacts Bearer tokens in nested structures', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          request: {
            headers: {
              auth: 'Authorization: Bearer some-token-value',
            },
          },
        }),
      )
      expect(JSON.parse(result)).toEqual({
        request: {
          headers: {
            auth: 'Authorization: Bearer [REDACTED]',
          },
        },
      })
    })

    it('redacts multiple Bearer tokens in the same object', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          req: 'Authorization: Bearer token1',
          upstream: 'Authorization: Bearer token2',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        req: 'Authorization: Bearer [REDACTED]',
        upstream: 'Authorization: Bearer [REDACTED]',
      })
    })
  })

  describe('passthrough behavior', () => {
    it('returns the line unchanged when nothing matches', async () => {
      const redactLine = await loadRedactLine()

      const line = jsonLine({ safe: 'value', count: 42 })
      expect(redactLine(line)).toBe(line)
    })

    it('handles empty objects', async () => {
      const redactLine = await loadRedactLine()

      const line = jsonLine({})
      expect(redactLine(line)).toBe(line)
    })
  })

  describe('combined redaction', () => {
    it('redacts both secrets and auth headers in one pass', async () => {
      const redactLine = await loadRedactLine('API_KEY', {
        API_KEY: 'sk_live_xyz',
      })

      const result = redactLine(
        jsonLine({
          key: 'sk_live_xyz',
          header: 'Authorization: Bearer jwt.token.here',
          safe: 'no secrets',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        key: '[REDACTED]',
        header: 'Authorization: Bearer [REDACTED]',
        safe: 'no secrets',
      })
    })
  })
})
