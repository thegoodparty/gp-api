import { BadGatewayException, Logger } from '@nestjs/common'

const {
  PEERLY_MD5_EMAIL,
  PEERLY_MD5_PASSWORD,
  PEERLY_API_BASE_URL,
  PEERLY_ACCOUNT_NUMBER,
  PEERLY_HTTP_TIMEOUT = '15000', // 15 seconds default
} = process.env

if (!PEERLY_API_BASE_URL) {
  throw new Error('Missing PEERLY_API_BASE_URL config')
}

if (!PEERLY_MD5_EMAIL || !PEERLY_MD5_PASSWORD) {
  throw new Error('Missing PEERLY_MD5_EMAIL or PEERLY_MD5_PASSWORD config')
}

if (!PEERLY_ACCOUNT_NUMBER) {
  throw new Error('Missing PEERLY_ACCOUNT_NUMBER config')
}

export class PeerlyBaseConfig {
  readonly baseUrl = PEERLY_API_BASE_URL
  readonly email = PEERLY_MD5_EMAIL
  readonly password = PEERLY_MD5_PASSWORD
  readonly accountNumber = PEERLY_ACCOUNT_NUMBER
  readonly httpTimeoutMs = parseInt(PEERLY_HTTP_TIMEOUT, 10)

  protected readonly logger = new Logger(this.constructor.name)

  protected validateData<T>(
    data: unknown,
    dto: { create: (data: unknown) => T },
    context: string,
  ): T {
    try {
      return dto.create(data)
    } catch (error) {
      this.logger.error(`${context} response validation failed:`, error)
      throw new BadGatewayException(
        `Invalid ${context} response from Peerly API`,
      )
    }
  }
}
