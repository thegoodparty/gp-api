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
  ContactType,
  GetDomainSuggestionsCommand,
  UpdateDomainNameserversCommand,
} from '@aws-sdk/client-route-53-domains'
import { AwsService } from './aws.service'
import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  ResourceRecordSet,
  Change,
  ChangeAction,
  ListHostedZonesByNameCommand,
  Route53ServiceException,
  RRType,
} from '@aws-sdk/client-route-53'
import { formatPhoneNumber } from 'src/shared/util/numbers.util'

export const GP_DOMAIN_CONTACT: ContactDetail = {
  FirstName: 'Victoria',
  LastName: 'Mitchell',
  ContactType: ContactType.COMPANY,
  OrganizationName: 'Good Party LLC',
  Email: 'accounts@goodparty.org',
  PhoneNumber: '+1.3126851162',
  AddressLine1: '916 Silver Spur Rd',
  City: 'Rolling Hills Estates',
  State: 'CA',
  CountryCode: 'US',
  ZipCode: '90274',
}

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
    })
  }

  /**
   * Registers a new domain name through Route53
   * @param domainName - The domain name to register (e.g. 'example.com')
   * @see {@link https://docs.aws.amazon.com/Route53/latest/APIReference/API_domains_RegisterDomain.html}
   */
  async registerDomain(domainName: string, ownerContact: ContactDetail) {
    return this.executeAwsOperation(async () => {
      const command = new RegisterDomainCommand({
        DomainName: domainName,
        DurationInYears: 1,
        AdminContact: {
          ...ownerContact,
          PhoneNumber: formatPhoneNumber(
            ownerContact.PhoneNumber,
            GP_DOMAIN_CONTACT.PhoneNumber,
          ),
        },
        RegistrantContact: {
          ...ownerContact,
          PhoneNumber: formatPhoneNumber(
            ownerContact.PhoneNumber,
            GP_DOMAIN_CONTACT.PhoneNumber,
          ),
        },
        TechContact: GP_DOMAIN_CONTACT,
        BillingContact: GP_DOMAIN_CONTACT,
        PrivacyProtectAdminContact: true,
        PrivacyProtectRegistrantContact: true,
        PrivacyProtectTechContact: true,
        PrivacyProtectBillingContact: true,
      })

      const response = await this.domainsClient.send(command)
      this.logger.debug(
        'Registration kicked off. OperationId =',
        response.OperationId,
      )

      return response.OperationId
    })
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
    })
  }

  /**
   * Updates the name servers for a domain
   * @param domainName - The domain name to update name servers for (e.g. 'example.com')
   * @param nameServers - Array of name server hostnames
   * @see {@link https://docs.aws.amazon.com/Route53/latest/APIReference/API_domains_UpdateDomainNameservers.html}
   */
  async updateDomainNameservers(domainName: string, nameServers: string[]) {
    return this.executeAwsOperation(async () => {
      const command = new UpdateDomainNameserversCommand({
        DomainName: domainName,
        Nameservers: nameServers.map((nameServer) => ({
          Name: nameServer,
        })),
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

      return result.OperationId
    })
  }

  async setDnsRecords(
    domainName: string,
    type: RRType,
    value: string,
    ttl: number = 300, // 5 minutes
  ) {
    return this.executeAwsOperation(async () => {
      const { HostedZones } = await this.dnsClient.send(
        new ListHostedZonesByNameCommand({
          DNSName: domainName,
          MaxItems: 1,
        }),
      )

      const hostedZone = HostedZones?.[0]
      if (!hostedZone?.Id) {
        throw new NotFoundException(
          `No hosted zone found for domain ${domainName}`,
        )
      }

      const hostedZoneId = hostedZone?.Id?.replace('/hostedzone/', '')

      const recordSet: ResourceRecordSet = {
        Name: domainName,
        Type: type,
        TTL: ttl,
        ResourceRecords: [
          {
            Value: value,
          },
        ],
      }

      const change: Change = {
        Action: ChangeAction.UPSERT,
        ResourceRecordSet: recordSet,
      }

      const command = new ChangeResourceRecordSetsCommand({
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [change],
        },
      })

      const result = await this.dnsClient.send(command)

      if (result instanceof Route53ServiceException) {
        switch (result.name) {
          case 'InvalidInput':
            throw new BadRequestException(result.message)
          case 'HostedZoneNotFound':
            throw new NotFoundException(result.message)
          default:
            throw result
        }
      }

      return result
    })
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
    })
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
    })
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
        MaxItems: 1000,
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
    })
  }

  /**
   * Gets domain name suggestions based on a search term
   * @param domainName - The domain name to get suggestions for (e.g. 'example')
   * @param suggestionCount - Number of suggestions to return (default: 10, max: 50)
   * @param onlyAvailable - Whether to return only available domains (default: true)
   * @returns List of domain suggestions with availability and pricing
   * @see {@link https://docs.aws.amazon.com/Route53/latest/APIReference/API_domains_GetDomainSuggestions.html}
   */
  async getDomainSuggestions(
    domainName: string,
    suggestionCount: number = 10,
    onlyAvailable: boolean = true,
  ) {
    return this.executeAwsOperation(async () => {
      const command = new GetDomainSuggestionsCommand({
        DomainName: domainName,
        SuggestionCount: Math.min(suggestionCount, 50), // AWS max is 50
        OnlyAvailable: onlyAvailable,
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
    })
  }

  /**
   * Lists all domains registered in the AWS account
   * @see {@link https://docs.aws.amazon.com/Route53/latest/APIReference/API_domains_ListDomains.html}
   */
  async listDomains() {
    return this.executeAwsOperation(async () => {
      const command = new ListDomainsCommand({
        MaxItems: 1000,
      })
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
    })
  }
}
