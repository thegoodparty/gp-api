import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import Cloudflare from 'cloudflare'

type DNSRecordType =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'MX'
  | 'NS'
  | 'TXT'
  | 'CAA'
  | 'CERT'
  | 'DNSKEY'
  | 'DS'
  | 'HTTPS'
  | 'LOC'
  | 'NAPTR'
  | 'SMIMEA'
  | 'SRV'
  | 'SSHFP'
  | 'SVCB'
  | 'TLSA'
  | 'URI'

@Injectable()
export class CloudflareService {
  private readonly logger = new Logger(CloudflareService.name)
  private readonly client: Cloudflare

  constructor() {
    const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_API_EMAIL, CLOUDFLARE_API_KEY } =
      process.env

    if (
      !CLOUDFLARE_API_TOKEN &&
      (!CLOUDFLARE_API_EMAIL || !CLOUDFLARE_API_KEY)
    ) {
      throw new Error(
        'Either CLOUDFLARE_API_TOKEN or both CLOUDFLARE_API_EMAIL and CLOUDFLARE_API_KEY must be set in ENV',
      )
    }

    if (CLOUDFLARE_API_TOKEN) {
      this.client = new Cloudflare({
        apiToken: CLOUDFLARE_API_TOKEN,
      })
    } else {
      this.client = new Cloudflare({
        apiEmail: CLOUDFLARE_API_EMAIL,
        apiKey: CLOUDFLARE_API_KEY,
      })
    }
  }

  /**
   * Creates a new zone (domain) in Cloudflare
   * @param domainName - The domain name to add (e.g. 'example.com')
   * @param accountId - The Cloudflare account ID
   * @returns The created zone object
   */
  async createZone(domainName: string, accountId: string) {
    try {
      this.logger.debug(`Creating Cloudflare zone for domain: ${domainName}`)

      const zone = await this.client.zones.create({
        account: { id: accountId },
        name: domainName,
        type: 'full',
      })

      this.logger.debug(`Successfully created zone for ${domainName}`, zone)
      return zone
    } catch (error) {
      this.logger.error(`Error creating zone for ${domainName}:`, error)
      if (error instanceof Cloudflare.APIError) {
        if (error.status === 400) {
          throw new BadRequestException(error.message)
        }
        if (error.status === 404) {
          throw new NotFoundException(error.message)
        }
      }
      throw error
    }
  }

  /**
   * Gets zone details by domain name
   * @param domainName - The domain name to look up
   * @returns The zone object or null if not found
   */
  async getZoneByName(domainName: string) {
    try {
      this.logger.debug(`Getting Cloudflare zone for domain: ${domainName}`)

      const zones = await this.client.zones.list({ name: domainName })
      const zone = zones.result?.[0]

      if (!zone) {
        this.logger.warn(`Zone not found for domain: ${domainName}`)
        return null
      }

      return zone
    } catch (error) {
      this.logger.error(`Error getting zone for ${domainName}:`, error)
      throw error
    }
  }

  /**
   * Creates an A record pointing to the specified IP address
   * @param zoneId - The Cloudflare zone ID
   * @param name - The record name (can be '@' for root domain or subdomain)
   * @param ipAddress - The IP address to point to
   * @param ttl - Time to live in seconds (default: 300)
   * @returns The created DNS record
   */
  async createARecord(
    zoneId: string,
    name: string,
    ipAddress: string,
    ttl: number = 300,
  ) {
    try {
      this.logger.debug(
        `Creating A record: ${name} -> ${ipAddress} in zone ${zoneId}`,
      )

      const record = await this.client.dns.records.create({
        zone_id: zoneId,
        name,
        type: 'A',
        content: ipAddress,
        ttl,
      })

      this.logger.debug(`Successfully created A record`, record)
      return record
    } catch (error) {
      this.logger.error(`Error creating A record:`, error)
      if (error instanceof Cloudflare.APIError) {
        if (error.status === 400) {
          throw new BadRequestException(error.message)
        }
        if (error.status === 404) {
          throw new NotFoundException(error.message)
        }
      }
      throw error
    }
  }

  /**
   * Creates a CNAME record
   * @param zoneId - The Cloudflare zone ID
   * @param name - The record name
   * @param target - The target domain
   * @param ttl - Time to live in seconds (default: 300)
   * @returns The created DNS record
   */
  async createCNAMERecord(
    zoneId: string,
    name: string,
    target: string,
    ttl: number = 300,
  ) {
    try {
      this.logger.debug(
        `Creating CNAME record: ${name} -> ${target} in zone ${zoneId}`,
      )

      const record = await this.client.dns.records.create({
        zone_id: zoneId,
        name,
        type: 'CNAME',
        content: target,
        ttl,
      })

      this.logger.debug(`Successfully created CNAME record`, record)
      return record
    } catch (error) {
      this.logger.error(`Error creating CNAME record:`, error)
      if (error instanceof Cloudflare.APIError) {
        if (error.status === 400) {
          throw new BadRequestException(error.message)
        }
        if (error.status === 404) {
          throw new NotFoundException(error.message)
        }
      }
      throw error
    }
  }

  /**
   * Lists DNS records for a zone
   * @param zoneId - The Cloudflare zone ID
   * @param type - Optional record type filter
   * @returns Array of DNS records
   */
  async listDNSRecords(zoneId: string, type?: DNSRecordType) {
    try {
      this.logger.debug(`Listing DNS records for zone ${zoneId}`)

      const records = await this.client.dns.records.list({
        zone_id: zoneId,
        ...(type && { type }),
      })

      return records.result || []
    } catch (error) {
      this.logger.error(`Error listing DNS records:`, error)
      throw error
    }
  }

  /**
   * Deletes a DNS record
   * @param zoneId - The Cloudflare zone ID
   * @param recordId - The DNS record ID to delete
   */
  async deleteDNSRecord(zoneId: string, recordId: string) {
    try {
      this.logger.debug(`Deleting DNS record ${recordId} from zone ${zoneId}`)

      await this.client.dns.records.delete(recordId, {
        zone_id: zoneId,
      })

      this.logger.debug(`Successfully deleted DNS record ${recordId}`)
    } catch (error) {
      this.logger.error(`Error deleting DNS record:`, error)
      if (error instanceof Cloudflare.APIError) {
        if (error.status === 404) {
          throw new NotFoundException('DNS record not found')
        }
      }
      throw error
    }
  }

  /**
   * Creates page rules for domain masking/redirection
   * @param zoneId - The Cloudflare zone ID
   * @param urlPattern - The URL pattern to match (e.g., "example.com/*")
   * @param redirectUrl - The URL to redirect to
   * @param statusCode - HTTP status code for redirect (301 or 302)
   * @returns The created page rule
   */
  async createPageRule(
    zoneId: string,
    urlPattern: string,
    redirectUrl: string,
    statusCode: number = 301,
  ) {
    try {
      this.logger.debug(
        `Creating page rule for ${urlPattern} -> ${redirectUrl}`,
      )

      // Note: Page Rules API might be deprecated in favor of Redirect Rules
      // This is a placeholder - we may need to use the newer Rules API
      const pageRule = {
        targets: [
          {
            target: 'url',
            constraint: {
              operator: 'matches',
              value: urlPattern,
            },
          },
        ],
        actions: [
          {
            id: 'forwarding_url',
            value: {
              url: redirectUrl,
              status_code: statusCode,
            },
          },
        ],
        status: 'active',
        priority: 1,
      }

      // TODO: Implement actual page rule creation once we have the correct API endpoint
      this.logger.warn(
        'Page rule creation not yet implemented - using placeholder',
      )
      return pageRule
    } catch (error) {
      this.logger.error(`Error creating page rule:`, error)
      throw error
    }
  }
}
