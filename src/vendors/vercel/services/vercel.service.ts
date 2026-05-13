import { HttpStatus, Injectable } from '@nestjs/common'
import { Vercel } from '@vercel/sdk'
import { Methods } from 'http-constants-ts'
import type {
  GetRecordsResponseBody,
  Records as VercelDNSRecord,
} from '@vercel/sdk/models/getrecordsop'
import { ForwardEmailDomainResponse } from '../../forwardEmail/forwardEmail.types'
import { NotFound } from '@vercel/sdk/models/notfound'
import { VercelError } from '@vercel/sdk/models/vercelerror'
import { parsePhoneNumberWithError } from 'libphonenumber-js'
import { PinoLogger } from 'nestjs-pino'

const { VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } = process.env
const FETCH_REDIRECT_MANUAL = 'manual' as const
const HTTPS_PROTOCOL = 'https:'
const VERCEL_DOMAIN = 'vercel.com'
const LOCATION_HEADER = 'location'
const MAX_VERIFICATION_REDIRECTS = 10
const HTTP_STATUS_MULTIPLE_CHOICES = 300

if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
  throw new Error(
    'VERCEL_TOKEN, VERCEL_PROJECT_ID, and VERCEL_TEAM_ID must be set in environment variables',
  )
}

export const FORWARDEMAIL_MX1_VALUE = 'mx1.forwardemail.net'
export const FORWARDEMAIL_MX2_VALUE = 'mx2.forwardemail.net'
export const FORWARDEMAIL_TXT_VALUE_PREFIX = 'forward-email-site-verification='

export enum VercelDnsRecordType {
  Mx = 'MX',
  Txt = 'TXT',
}

export type DNSRecord = { uid: string; updated?: number }

@Injectable()
export class VercelService {
  private readonly client = new Vercel({ bearerToken: VERCEL_TOKEN })

  isVercelNotFoundError(e: unknown): e is NotFound {
    return (
      e instanceof NotFound ||
      (e instanceof VercelError &&
        e.statusCode === Number(HttpStatus.NOT_FOUND))
    )
  }

  async getProjectDomain(domainName: string) {
    try {
      return await this.client.projects.getProjectDomain({
        idOrName: VERCEL_PROJECT_ID!,
        domain: domainName,
        teamId: VERCEL_TEAM_ID,
      })
    } catch (error) {
      this.logger.error({ error }, `Error getting domain ${domainName}:`)
      throw error
    }
  }

  async addDomainToProject(domainName: string) {
    try {
      return await this.client.projects.addProjectDomain({
        idOrName: VERCEL_PROJECT_ID!,
        teamId: VERCEL_TEAM_ID,
        requestBody: {
          name: domainName,
        },
      })
    } catch (error) {
      this.logger.error(
        { error },
        `Error adding domain ${domainName} to project:`,
      )
      throw error
    }
  }

  async removeDomainFromProject(domainName: string) {
    try {
      return await this.client.projects.removeProjectDomain({
        idOrName: VERCEL_PROJECT_ID!,
        domain: domainName,
        teamId: VERCEL_TEAM_ID,
      })
    } catch (error) {
      this.logger.error(
        { error },
        `Error removing domain ${domainName} from project:`,
      )
      throw error
    }
  }

  async verifyProjectDomain(domainName: string) {
    try {
      return await this.client.projects.verifyProjectDomain({
        idOrName: VERCEL_PROJECT_ID!,
        domain: domainName,
        teamId: VERCEL_TEAM_ID,
      })
    } catch (error) {
      this.logger.error({ error }, `Error verifying domain ${domainName}:`)
      throw error
    }
  }

  async submitDomainRegistrantVerification(verificationUrl: string) {
    if (!this.isAllowedVercelUrl(verificationUrl)) {
      throw new Error(
        `Refusing to submit non-vercel.com verification URL: ${verificationUrl}`,
      )
    }
    try {
      const response =
        await this.fetchVerificationUrlWithSafeRedirects(verificationUrl)
      if (!response.ok) {
        throw new Error(
          `Vercel returned ${response.status} for registrant verification URL`,
        )
      }
      return { status: response.status }
    } catch (error) {
      this.logger.error(
        { error, verificationUrl },
        'Error submitting Vercel domain registrant verification:',
      )
      throw error
    }
  }

  private async fetchVerificationUrlWithSafeRedirects(initialUrl: string) {
    let currentUrl = initialUrl
    let redirectCount = 0

    while (true) {
      const response = await fetch(currentUrl, {
        method: Methods.GET,
        redirect: FETCH_REDIRECT_MANUAL,
      })

      const location = response.headers.get(LOCATION_HEADER)
      if (!this.isRedirectResponse(response.status) || !location) {
        return response
      }

      if (redirectCount >= MAX_VERIFICATION_REDIRECTS) {
        throw new Error(
          `Too many redirects for registrant verification URL: ${initialUrl}`,
        )
      }

      const nextUrl = new URL(location, currentUrl).toString()
      if (!this.isAllowedVercelUrl(nextUrl)) {
        throw new Error(
          `Refusing redirected registrant verification URL: ${nextUrl}`,
        )
      }

      currentUrl = nextUrl
      redirectCount += 1
    }
  }

  private isRedirectResponse(status: number) {
    return (
      status >= HTTP_STATUS_MULTIPLE_CHOICES && status < HttpStatus.BAD_REQUEST
    )
  }

  private isAllowedVercelUrl(urlString: string) {
    try {
      const url = new URL(urlString)
      return (
        url.protocol === HTTPS_PROTOCOL &&
        (url.hostname === VERCEL_DOMAIN ||
          url.hostname.endsWith(`.${VERCEL_DOMAIN}`))
      )
    } catch {
      return false
    }
  }

  /**
   * Check the price for a domain
   * @see https://vercel.com/docs/domains/registrar-api
   */
  async checkDomainPrice(domainName: string): Promise<{ price: number }> {
    try {
      const result = await this.client.domainsRegistrar.getDomainPrice({
        domain: domainName,
        teamId: VERCEL_TEAM_ID,
      })

      this.logger.debug(result, `Price check for ${domainName}:`)

      if (result.purchasePrice === null || result.purchasePrice === undefined) {
        throw new Error(
          `Domain ${domainName} is not available for purchase or price unavailable`,
        )
      }

      const price =
        typeof result.purchasePrice === 'string'
          ? parseFloat(result.purchasePrice)
          : result.purchasePrice

      return { price }
    } catch (error) {
      this.logger.error(
        { error },
        `Error checking price for domain ${domainName}:`,
      )
      throw error
    }
  }

  /**
   * Purchase a domain through Vercel
   * @param domainName - The domain name to purchase (e.g. 'example.com')
   * @param contact - Contact information for domain registration
   * @param expectedPrice - The expected price for the domain
   * @param autoRenew - Whether to auto-renew the domain (defaults to true)
   * @param years - Number of years to purchase the domain for (defaults to 1)
   * @returns Operation result from Vercel
   */
  async purchaseDomain(
    domainName: string,
    contact: {
      firstName: string
      lastName: string
      email: string
      phoneNumber: string
      addressLine1: string
      addressLine2?: string
      city: string
      state: string
      zipCode: string
    },
    expectedPrice: number,
    autoRenew: boolean = true,
    years: number = 1,
  ) {
    try {
      this.logger.debug(`Purchasing domain ${domainName} through Vercel`)

      let formattedPhone: string
      try {
        const phoneNumber = parsePhoneNumberWithError(contact.phoneNumber, 'US')
        formattedPhone = phoneNumber.format('E.164')
        this.logger.debug(`Formatted phone number: ${formattedPhone}`)
      } catch (phoneError) {
        this.logger.error(
          { phoneError },
          `Error formatting phone number ${contact.phoneNumber}:`,
        )
        throw new Error(
          `Invalid phone number format: ${contact.phoneNumber}. Must be a valid US phone number.`,
        )
      }

      const result = await this.client.domainsRegistrar.buySingleDomain({
        domain: domainName.trim(),
        teamId: VERCEL_TEAM_ID,
        requestBody: {
          autoRenew,
          years,
          expectedPrice,
          contactInformation: {
            firstName: contact.firstName.trim(),
            lastName: contact.lastName.trim(),
            email: contact.email.trim(),
            phone: formattedPhone,
            address1: contact.addressLine1.trim(),
            ...(contact.addressLine2?.trim()
              ? { address2: contact.addressLine2.trim() }
              : {}),
            city: contact.city.trim(),
            state: contact.state.trim(),
            zip: contact.zipCode.trim(),
            country: 'US',
          },
        },
      })

      this.logger.debug(result, `Domain purchase result for ${domainName}:`)
      return result
    } catch (error) {
      this.logger.error({ error }, `Error purchasing domain ${domainName}:`)
      throw error
    }
  }

  async getDomainDetails(domainName: string) {
    try {
      return await this.client.domains.getDomain({
        domain: domainName,
        teamId: VERCEL_TEAM_ID,
      })
    } catch (error) {
      this.logger.error(
        { error },
        `Error getting domain details for ${domainName}:`,
      )
      throw error
    }
  }

  async listDomains() {
    try {
      return await this.client.domains.getDomains({
        teamId: VERCEL_TEAM_ID,
      })
    } catch (error) {
      this.logger.error({ error }, 'Error listing domains:')
      throw error
    }
  }

  async listDnsRecords(domainName: string): Promise<VercelDNSRecord[]> {
    try {
      const all: VercelDNSRecord[] = []
      const limit = '100'
      let since: string | null = null
      let hasMore = true
      let backoff = 250
      const maxBackoff = 4000
      while (hasMore) {
        const res = await this.client.dns.getRecords({
          domain: domainName,
          teamId: VERCEL_TEAM_ID,
          limit,
          ...(since ? { since } : {}),
        })
        if (typeof res === 'string') {
          this.logger.error(
            `Error listing DNS records for ${domainName}: ${res}`,
          )
          return []
        }
        const page = res as GetRecordsResponseBody
        // Vercel API pagination/records are untyped — SDK does not expose typed page structure
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const records = (page as { records: VercelDNSRecord[] }).records ?? []
        all.push(...records)
        const nextTs =
          // Vercel API pagination/records are untyped — SDK does not expose typed page structure
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          (page as { pagination?: { next?: number | null } }).pagination
            ?.next ?? null
        hasMore = Boolean(nextTs)
        since = nextTs ? String(nextTs) : null
        if (hasMore) {
          await new Promise((r) => setTimeout(r, backoff))
          backoff = Math.min(backoff * 2, maxBackoff)
        }
      }
      return all
    } catch (error) {
      this.logger.error(
        { error },
        `Error listing DNS records for ${domainName}:`,
      )
      throw error
    }
  }

  async createMXRecords(domain: string): Promise<DNSRecord[]> {
    try {
      const mx1 = await this.client.dns.createRecord({
        domain,
        teamId: VERCEL_TEAM_ID,
        requestBody: {
          type: VercelDnsRecordType.Mx,
          name: '',
          value: FORWARDEMAIL_MX1_VALUE,
          mxPriority: 10,
          ttl: 60,
        },
      })

      const mx2 = await this.client.dns.createRecord({
        domain,
        teamId: VERCEL_TEAM_ID,
        requestBody: {
          type: VercelDnsRecordType.Mx,
          name: '',
          value: FORWARDEMAIL_MX2_VALUE,
          mxPriority: 10,
          ttl: 60,
        },
      })

      return [mx1, mx2].filter((r): r is DNSRecord =>
        Boolean((r as DNSRecord).uid),
      )
    } catch (error) {
      this.logger.error({ error }, `Error creating MX records for ${domain}:`)
      throw error
    }
  }

  async createTXTVerificationRecord(
    domain: string,
    forwardingDomainResponse: ForwardEmailDomainResponse,
  ): Promise<DNSRecord> {
    try {
      const res = await this.client.dns.createRecord({
        domain,
        teamId: VERCEL_TEAM_ID,
        requestBody: {
          type: VercelDnsRecordType.Txt,
          name: '',
          value: `${FORWARDEMAIL_TXT_VALUE_PREFIX}${forwardingDomainResponse.verification_record}`,
          ttl: 60,
        },
      })
      return res as DNSRecord
    } catch (error) {
      this.logger.error({ error }, `Error creating SPF record for ${domain}:`)
      throw error
    }
  }

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(VercelService.name)
  }
}
