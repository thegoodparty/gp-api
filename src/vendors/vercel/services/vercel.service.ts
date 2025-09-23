import { Injectable, Logger } from '@nestjs/common'
import { Vercel } from '@vercel/sdk'
import type {
  GetRecordsResponseBody,
  Records as VercelDNSRecord,
} from '@vercel/sdk/src/models/getrecordsop'
import { ForwardEmailDomainResponse } from '../../forwardEmail/forwardEmail.types'

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

  async getProjectDomain(domainName: string) {
    try {
      return await this.client.projects.getProjectDomain({
        idOrName: VERCEL_PROJECT_ID!,
        domain: domainName,
        teamId: VERCEL_TEAM_ID,
      })
    } catch (error) {
      this.logger.error(`Error getting domain ${domainName}:`, error)
      throw new Error(`Failed to get domain: ${error}`)
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
      throw new Error(`Failed to add domain to Vercel project: ${error}`)
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
      throw new Error(`Failed to remove domain from Vercel project: ${error}`)
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
      throw new Error(`Failed to verify domain: ${error}`)
    }
  }

  async checkDomainPrice(domainName: string) {
    try {
      const result = await this.client.domains.checkDomainPrice({
        name: domainName,
        teamId: VERCEL_TEAM_ID,
      })

      this.logger.debug(`Price check for ${domainName}:`, result)
      return result
    } catch (error) {
      this.logger.error(`Error checking price for domain ${domainName}:`, error)
      throw new Error(`Failed to check domain price: ${error}`)
    }
  }

  /**
   * Purchase a domain through Vercel
   * @param domainName - The domain name to purchase (e.g. 'example.com')
   * @param contact - Contact information for domain registration
   * @param expectedPrice - The expected price for the domain
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
  ) {
    try {
      this.logger.debug(`Purchasing domain ${domainName} through Vercel`)

      const result = await this.client.domains.buyDomain({
        teamId: VERCEL_TEAM_ID,
        requestBody: {
          name: domainName,
          expectedPrice,
          country: 'US',
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phoneNumber,
          address1: contact.addressLine1,
          city: contact.city,
          state: contact.state,
          postalCode: contact.zipCode,
        },
      })

      this.logger.debug(`Domain purchase result for ${domainName}:`, result)
      return result
    } catch (error) {
      this.logger.error(`Error purchasing domain ${domainName}:`, error)
      throw new Error(`Failed to register domain with Vercel: ${error}`)
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
      throw new Error(`Failed to get domain details: ${error}`)
    }
  }

  async listDomains() {
    try {
      return await this.client.domains.getDomains({
        teamId: VERCEL_TEAM_ID,
      })
    } catch (error) {
      this.logger.error('Error listing domains:', error)
      throw new Error(`Failed to list domains: ${error}`)
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
      throw new Error(`Failed to list DNS records: ${error}`)
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
      throw new Error(`Failed to create MX records: ${error}`)
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
      throw new Error(`Failed to create SPF record: ${error}`)
    }
  }
}
