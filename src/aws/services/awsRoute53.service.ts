import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import {
  Route53DomainsClient,
  CheckDomainAvailabilityCommand,
  RegisterDomainCommand,
  GetOperationDetailCommand,
  ContactDetail,
  ListDomainsCommand,
  GetDomainDetailCommand,
  ListPricesCommand,
  Route53DomainsServiceException,
  DisableDomainAutoRenewCommand,
} from '@aws-sdk/client-route-53-domains'
import { Route53Client } from '@aws-sdk/client-route-53'
import { AwsService } from './aws.service'

const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env
const AWS_ROUTE_53_REGION = 'us-east-1'

@Injectable()
export class AwsRoute53Service extends AwsService {
  private readonly domainsClient: Route53DomainsClient
  private readonly dnsClient: Route53Client

  constructor() {
    super()

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error(
        'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are not set in ENV',
      )
    }

    const initOptions = {
      region: AWS_ROUTE_53_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    }

    this.domainsClient = new Route53DomainsClient(initOptions)
    this.dnsClient = new Route53Client(initOptions)
  }

  /**
   * Checks if a domain name is available for registration
   * @param domainName - The domain name to check (e.g. 'example.com')
   * @see {@link https://docs.aws.amazon.com/Route53/latest/APIReference/API_domains_CheckDomainAvailability.html}
   */
  async checkDomainAvailability(domainName: string) {
    return this.executeAwsOperation(async () => {
      const command = new CheckDomainAvailabilityCommand({
        DomainName: domainName,
      })
      const result = await this.domainsClient.send(command)

      if (result instanceof Route53DomainsServiceException) {
        switch (result.name) {
          case 'InvalidInput':
          case 'UnsupportedTLD':
            throw new BadRequestException(result.message)
          default:
            throw result
        }
      }

      return result
    }, 'checkDomainAvailability')
  }

  /**
   * Registers a new domain name through Route53
   * @param domainName - The domain name to register (e.g. 'example.com')
   * @see {@link https://docs.aws.amazon.com/Route53/latest/APIReference/API_domains_RegisterDomain.html}
   */
  async registerDomain(domainName: string) {
    return this.executeAwsOperation(async () => {
      // TODO: who should this be? do we need to ask the user for this?
      const admin: ContactDetail = {
        FirstName: 'Jane',
        LastName: 'Doe',
        ContactType: 'PERSON',
        Email: 'jane.doe@example.com',
        PhoneNumber: '+1.5551234567',
        AddressLine1: '123 Main St',
        City: 'Atlanta',
        State: 'GA',
        CountryCode: 'US',
        ZipCode: '30301',
      }
      // TODO: do we need different contact info for admin, registrant, & tech?
      const command = new RegisterDomainCommand({
        DomainName: domainName,
        DurationInYears: 1,
        AdminContact: admin,
        RegistrantContact: admin,
        TechContact: admin,
        PrivacyProtectAdminContact: true,
        PrivacyProtectRegistrantContact: true,
        PrivacyProtectTechContact: true,
      })

      const response = await this.domainsClient.send(command)
      this.logger.debug(
        'Registration kicked off. OperationId =',
        response.OperationId,
      )

      return response.OperationId
    }, 'registerDomain')
  }

  /**
   * Disables auto-renewal for a domain registration
   * @param domainName - The domain name to disable auto-renewal for (e.g. 'example.com')
   * @see {@link https://docs.aws.amazon.com/Route53/latest/APIReference/API_domains_DisableDomainAutoRenew.html}
   */
  async disableAutoRenew(domainName: string) {
    return this.executeAwsOperation(async () => {
      const command = new DisableDomainAutoRenewCommand({
        DomainName: domainName,
      })
      const result = await this.domainsClient.send(command)

      if (result instanceof Route53DomainsServiceException) {
        switch (result.name) {
          case 'InvalidInput':
            throw new BadRequestException(result.message)
          case 'DomainNotFound':
            throw new NotFoundException(result.message)
          default:
            throw result
        }
      }

      return result
    }, 'disableAutoRenew')
  }

  /**
   * Gets the status of a domain registration or renewal operation
   * @param operationId - The ID of the operation to check
   * @see {@link https://docs.aws.amazon.com/Route53/latest/APIReference/API_domains_GetOperationDetail.html}
   */
  async getOperationDetail(operationId: string) {
    return this.executeAwsOperation(async () => {
      const result = await this.domainsClient.send(
        new GetOperationDetailCommand({ OperationId: operationId }),
      )

      if (result instanceof Route53DomainsServiceException) {
        switch (result.name) {
          case 'InvalidInput':
            throw new BadRequestException(result.message)
          case 'OperationNotFound':
            throw new NotFoundException(result.message)
          default:
            throw result
        }
      }

      return result
    }, 'getOperationDetail')
  }

  /**
   * Gets detailed information about a registered domain
   * @param domainName - The domain name to get details for (e.g. 'example.com')
   * @see {@link https://docs.aws.amazon.com/Route53/latest/APIReference/API_domains_GetDomainDetail.html}
   */
  async getDomainDetails(domainName: string) {
    return this.executeAwsOperation(async () => {
      const command = new GetDomainDetailCommand({
        DomainName: domainName,
      })
      const result = await this.domainsClient.send(command)

      if (result instanceof Route53DomainsServiceException) {
        switch (result.name) {
          case 'InvalidInput':
            throw new BadRequestException(result.message)
          case 'DomainNotFound':
            throw new NotFoundException(result.message)
          default:
            throw result
        }
      }

      return result
    }, 'getDomainDetails')
  }

  /**
   * Lists domain registration prices, optionally filtered by TLD
   * @param tld - Optional TLD to filter prices for (e.g. 'com', 'net', etc.)
   * @returns List of domain prices
   * @see {@link https://docs.aws.amazon.com/Route53/latest/APIReference/API_domains_ListPrices.html}
   */
  async listPrices(tld?: string) {
    return this.executeAwsOperation(async () => {
      const command = new ListPricesCommand({
        MaxItems: 100,
        Tld: tld,
      })
      const result = await this.domainsClient.send(command)

      if (result instanceof Route53DomainsServiceException) {
        switch (result.name) {
          case 'InvalidInput':
          case 'UnsupportedTLD':
            throw new BadRequestException(result.message)
          default:
            throw result
        }
      }

      return result
    }, 'listPrices')
  }

  /**
   * Lists all domains registered in the AWS account
   * @see {@link https://docs.aws.amazon.com/Route53/latest/APIReference/API_domains_ListDomains.html}
   */
  async listDomains() {
    return this.executeAwsOperation(async () => {
      const command = new ListDomainsCommand({})
      const result = await this.domainsClient.send(command)

      if (result instanceof Route53DomainsServiceException) {
        switch (result.name) {
          case 'InvalidInput':
            throw new BadRequestException(result.message)
          default:
            throw result
        }
      }

      return result
    }, 'listDomains')
  }
}
