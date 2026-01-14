import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { Vercel } from '@vercel/sdk'
import type {
  GetRecordsResponseBody,
  Records as VercelDNSRecord,
} from '@vercel/sdk/models/getrecordsop'
import { ForwardEmailDomainResponse } from '../../forwardEmail/forwardEmail.types'
import { NotFound } from '@vercel/sdk/models/notfound'
import { VercelError } from '@vercel/sdk/models/vercelerror'
import { parsePhoneNumberWithError } from 'libphonenumber-js'

const { VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } = process.env

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
  private readonly logger = new Logger(VercelService.name)
  private readonly client = new Vercel({ bearerToken: VERCEL_TOKEN })

  isVercelNotFoundError(e: unknown): e is NotFound {
    return (
      e instanceof NotFound ||
      (e instanceof VercelError && e.statusCode === HttpStatus.NOT_FOUND)
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
      this.logger.error(`Error getting domain ${domainName}:`, error)
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
      this.logger.error(`Error adding domain ${domainName} to project:`, error)
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
        `Error removing domain ${domainName} from project:`,
        error,
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
      this.logger.error(`Error verifying domain ${domainName}:`, error)
      throw error
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

      this.logger.debug(`Price check for ${domainName}:`, result)

      if (result.purchasePrice === null || result.purchasePrice === undefined) {
        throw new Error(
          `Domain ${domainName} is not available for purchase or price unavailable`,
        )
      }

      return { price: result.purchasePrice }
    } catch (error) {
      this.logger.error(`Error checking price for domain ${domainName}:`, error)
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
          `Error formatting phone number ${contact.phoneNumber}:`,
          phoneError,
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

      this.logger.debug(`Domain purchase result for ${domainName}:`, result)
      return result
    } catch (error) {
      this.logger.error(`Error purchasing domain ${domainName}:`, error)
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
        `Error getting domain details for ${domainName}:`,
        error,
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
      this.logger.error('Error listing domains:', error)
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
        const records = (page as { records: VercelDNSRecord[] }).records ?? []
        all.push(...records)
        const nextTs =
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
      this.logger.error(`Error listing DNS records for ${domainName}:`, error)
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
      this.logger.error(`Error creating MX records for ${domain}:`, error)
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
      this.logger.error(`Error creating SPF record for ${domain}:`, error)
      throw error
    }
  }
}
