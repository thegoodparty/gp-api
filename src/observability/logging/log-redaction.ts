import { isNotNil } from 'es-toolkit'

const MIN_SECRET_LENGTH = 8

const buildSecretPattern = (): RegExp => {
  const escaped = (process.env.SECRET_NAMES ?? '')
    .split(',')
    .map((name) => process.env[name])
    .filter(isNotNil)
    .filter((s) => s.length >= MIN_SECRET_LENGTH)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

  escaped.push('(?<=Authorization: Bearer )[^"\\\\]+')
  escaped.push(
    '(?<=[?&](?:token|key|secret|password|access_token|api_key|apiKey|client_secret|credentials)=)[^&"\\\\]+',
  )
  escaped.push('(?<=:\\/\\/[^:]*:)[^@"\\\\]+(?=@)')

  return new RegExp(escaped.join('|'), 'g')
}

const secretPattern = buildSecretPattern()

export const redactLine = (line: string): string =>
  line.replace(secretPattern, '[REDACTED]')
