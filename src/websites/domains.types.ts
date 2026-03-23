import { BasePurchaseMetadata } from '../payments/purchase.types'
import { PaymentStatus } from '../payments/payments.types'
import {
  DomainAvailability,
  DomainSuggestion,
} from '@aws-sdk/client-route-53-domains'

export interface DomainPurchaseMetadata extends BasePurchaseMetadata {
  domainName: string
  websiteId: number
}

interface DomainSuggestionWithPrice extends DomainSuggestion {
  price: number | undefined
}

export interface DomainSearchResult extends DomainSuggestion {
  domainName: string
  availability: DomainAvailability | undefined
  suggestions: DomainSuggestionWithPrice[]
  price: number | undefined
}

// Enum for domain operation statuses
export enum DomainOperationStatus {
  SUBMITTED = 'SUBMITTED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCESSFUL = 'SUCCESSFUL',
  INACTIVE = 'INACTIVE',
  ERROR = 'ERROR',
  NO_DOMAIN = 'NO_DOMAIN',
}

// Enum for domain operation types
export enum DomainOperationType {
  REGISTER_DOMAIN = 'RegisterDomain',
}

export interface DomainOperationDetail {
  operationId: string | null
  status: DomainOperationStatus
  type: DomainOperationType
  submittedDate: Date
}

export interface DomainStatusResponse {
  message: DomainOperationStatus
  paymentStatus: PaymentStatus | null
  operationDetail?: DomainOperationDetail
}
