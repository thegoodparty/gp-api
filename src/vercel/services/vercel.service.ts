import { Injectable, Logger } from '@nestjs/common'
import { Vercel } from '@vercel/sdk'

const { VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } = process.env

if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
  throw new Error(
    'VERCEL_TOKEN, VERCEL_PROJECT_ID, and VERCEL_TEAM_ID must be set in environment variables',
  )
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
    } catch (error: any) {
      this.logger.error('Error adding domain:', error)
      throw error
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
          expectedPrice: expectedPrice,
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

      this.logger.debug('Domain purchase initiated through Vercel', result)
      return result
    } catch (error: any) {
      this.logger.error('Error purchasing domain through Vercel:', error)
      throw error
    }
  }

  /**
   * Check domain price through Vercel
   * @param domainName - The domain name to check price for
   * @returns Domain pricing information
   */
  async checkDomainPrice(domainName: string) {
    try {
      return await this.client.domains.checkDomainPrice({
        name: domainName,
        teamId: VERCEL_TEAM_ID,
      })
    } catch (error: any) {
      this.logger.error('Error checking domain price:', error)
      throw error
    }
  }

  /**
   * Get domain details from Vercel
   * @param domainName - The domain name to get details for
   * @returns Domain details
   */
  async getDomainDetails(domainName: string) {
    try {
      return await this.client.domains.getDomain({
        domain: domainName,
        teamId: VERCEL_TEAM_ID,
      })
    } catch (error: any) {
      this.logger.error('Error getting domain details:', error)
      throw error
    }
  }

  /**
   * List all domains registered through Vercel
   * @returns List of domains
   */
  async listDomains() {
    try {
      return await this.client.domains.getDomains({
        teamId: VERCEL_TEAM_ID,
      })
    } catch (error: any) {
      this.logger.error('Error listing domains:', error)
      throw error
    }
  }

  /**
   * Remove domain from project
   * @param domainName - The domain name to remove
   * @returns Operation result
   */
  async removeDomainFromProject(domainName: string) {
    try {
      return await this.client.projects.removeProjectDomain({
        idOrName: VERCEL_PROJECT_ID!,
        domain: domainName,
        teamId: VERCEL_TEAM_ID,
      })
    } catch (error: any) {
      this.logger.error('Error removing domain from project:', error)
      throw error
    }
  }

  /**
   * Update project domain settings
   * @param domainName - The domain name to update
   * @param settings - Domain settings to update
   * @returns Operation result
   */
  async updateProjectDomain(domainName: string, settings: any) {
    try {
      return await this.client.projects.updateProjectDomain({
        idOrName: VERCEL_PROJECT_ID!,
        domain: domainName,
        teamId: VERCEL_TEAM_ID,
        requestBody: settings,
      })
    } catch (error: any) {
      this.logger.error('Error updating project domain:', error)
      throw error
    }
  }

  /**
   * Verify project domain
   * @param domainName - The domain name to verify
   * @returns Verification result
   */
  async verifyProjectDomain(domainName: string) {
    try {
      return await this.client.projects.verifyProjectDomain({
        idOrName: VERCEL_PROJECT_ID!,
        domain: domainName,
        teamId: VERCEL_TEAM_ID,
      })
    } catch (error: any) {
      this.logger.error('Error verifying project domain:', error)
      throw error
    }
  }
}
