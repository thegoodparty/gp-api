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

    it('skips secret values shorter than 8 characters', async () => {
      const redactLine = await loadRedactLine('SHORT_SECRET,LONG_SECRET', {
        SHORT_SECRET: 'abc',
        LONG_SECRET: 'long-enough-secret',
      })

      const result = redactLine(
        jsonLine({
          a: 'abc',
          b: 'long-enough-secret',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        a: 'abc',
        b: '[REDACTED]',
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

  describe('sensitive query parameter redaction', () => {
    it('redacts token query parameter', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          url: 'https://example.com/callback?token=abc123xyz',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        url: 'https://example.com/callback?token=[REDACTED]',
      })
    })

    it('redacts api_key query parameter', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          url: 'https://api.example.com/data?api_key=sk_live_123&format=json',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        url: 'https://api.example.com/data?api_key=[REDACTED]&format=json',
      })
    })

    it('redacts multiple sensitive query parameters', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          url: 'https://example.com?client_secret=secret123&access_token=tok456&page=1',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        url: 'https://example.com?client_secret=[REDACTED]&access_token=[REDACTED]&page=1',
      })
    })

    it('redacts password query parameter', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          url: 'https://example.com/login?password=hunter2&user=admin',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        url: 'https://example.com/login?password=[REDACTED]&user=admin',
      })
    })

    it('redacts camelCase apiKey parameter', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          url: 'https://example.com/api?apiKey=my-key-value',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        url: 'https://example.com/api?apiKey=[REDACTED]',
      })
    })

    it('redacts credentials query parameter', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          url: 'https://example.com?credentials=user:pass123',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        url: 'https://example.com?credentials=[REDACTED]',
      })
    })

    it('does not redact non-sensitive query parameters', async () => {
      const redactLine = await loadRedactLine()

      const line = jsonLine({
        url: 'https://example.com?page=1&limit=50&name=test',
      })
      expect(redactLine(line)).toBe(line)
    })
  })

  describe('database connection string redaction', () => {
    it('redacts password in postgres connection string', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          message:
            'Connecting to postgres://dbuser:s3cretPass@db.example.com:5432/mydb',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        message:
          'Connecting to postgres://dbuser:[REDACTED]@db.example.com:5432/mydb',
      })
    })

    it('redacts password in mysql connection string', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          connection: 'mysql://root:admin123@localhost:3306/app',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        connection: 'mysql://root:[REDACTED]@localhost:3306/app',
      })
    })

    it('redacts password in redis connection string', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          url: 'redis://default:my-redis-pw@redis.example.com:6379',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        url: 'redis://default:[REDACTED]@redis.example.com:6379',
      })
    })

    it('redacts password with special characters in connection string', async () => {
      const redactLine = await loadRedactLine()

      const result = redactLine(
        jsonLine({
          dsn: 'postgresql://user:p%40ss!w0rd#123@host:5432/db',
        }),
      )
      expect(JSON.parse(result)).toEqual({
        dsn: 'postgresql://user:[REDACTED]@host:5432/db',
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

  describe('over-redaction prevention', () => {
    it('does not redact UUIDs, timestamps, routes, or trace IDs', async () => {
      const redactLine = await loadRedactLine('SHORT_KEY', {
        SHORT_KEY: 'e4',
      })

      const line = jsonLine({
        level: 30,
        time: 1727225308515,
        requestId: 'fa3dc8cf-bc5f-4e3f-a040-b39a67123422',
        request: { method: 'GET', url: '/v1/health' },
        trace_id: 'b8fe0061bea92c5002bc01095ef263c5',
        span_id: 'a60de0e72e16d90',
        trace_flags: '01',
        response: { statusCode: 200, bytes: 2 },
        responseTimeMs: 8,
      })

      expect(redactLine(line)).toBe(line)
    })

    it('preserves a realistic pino log line with no secrets', async () => {
      const redactLine = await loadRedactLine()

      const line = jsonLine({
        level: 30,
        time: 1727225308515,
        requestId: 'fa3dc8cf-bc5f-4e3f-a040-b39a67123422',
        request: { method: 'GET', url: '/v1/health' },
        trace_id: 'b8fe0061bea92c5002bc01095ef263c5',
        span_id: 'a60de0e72e16d90',
        trace_flags: '01',
        response: { statusCode: 200, bytes: 2 },
        responseTimeMs: 8,
        msg: 'Request completed NR-LINKING|NzEyODMzNXxBUE18QVBQTElDQVRJT058OTg3NzM5NjI2|ip-10-0-8-96.us-west-2.compute.internal|||',
      })

      expect(redactLine(line)).toBe(line)
    })
  })
})
