import { Injectable, Logger } from '@nestjs/common'
import { Vercel } from '@vercel/sdk'

const { VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } = process.env

if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
  throw new Error(
    'VERCEL_TOKEN, VERCEL_PROJECT_ID, and VERCEL_TEAM_ID must be set in environment variables',
  )
}

export const GP_DOMAIN_CONTACT = {
  firstName: 'Victoria',
  lastName: 'Mitchell',
  email: 'accounts@goodparty.org',
  phoneNumber: '+1.3126851162',
  addressLine1: '916 Silver Spur Rd',
  addressLine2: '',
  city: 'Rolling Hills Estates',
  state: 'CA',
  zipCode: '90274',
}

@Injectable()
export class VercelService {
  private readonly logger = new Logger(VercelService.name)
  private readonly client = new Vercel({ bearerToken: VERCEL_TOKEN })

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

      const finalContact = {
        firstName: contact.firstName || GP_DOMAIN_CONTACT.firstName,
        lastName: contact.lastName || GP_DOMAIN_CONTACT.lastName,
        email: contact.email || GP_DOMAIN_CONTACT.email,
        phone: contact.phoneNumber || GP_DOMAIN_CONTACT.phoneNumber,
        address1: contact.addressLine1 || GP_DOMAIN_CONTACT.addressLine1,
        city: contact.city || GP_DOMAIN_CONTACT.city,
        state: contact.state || GP_DOMAIN_CONTACT.state,
        postalCode: contact.zipCode || GP_DOMAIN_CONTACT.zipCode,
      }

      const result = await this.client.domains.buyDomain({
        teamId: VERCEL_TEAM_ID,
        requestBody: {
          name: domainName,
          expectedPrice,
          country: 'US',
          ...finalContact,
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
}
