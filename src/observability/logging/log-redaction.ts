import { isNotNil } from 'es-toolkit'

const buildSecretPattern = (): RegExp => {
  const escaped = (process.env.SECRET_NAMES ?? '')
    .split(',')
    .map((name) => process.env[name])
    .filter(isNotNil)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

  escaped.push('(?<=Authorization: Bearer )[^"\\\\]+')

  return new RegExp(escaped.join('|'), 'g')
}

const secretPattern = buildSecretPattern()

export const redactLine = (line: string): string =>
  line.replace(secretPattern, '[REDACTED]')
