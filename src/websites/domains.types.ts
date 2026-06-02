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

export interface PatternedDomainCandidate {
  domain: string
  price: number
}

export interface PatternedDomainSearchResult {
  candidates: PatternedDomainCandidate[]
}

// GoodParty's approved campaign TLD allowlist. Must stay in sync with the
// compliance_setup agent instruction (runbooks experiments/compliance_setup/
// instruction.md), which rejects any out-of-allowlist TLD as
// `unapproved_tld_returned`. .com/.org/.net/.vote are intentionally excluded.
// Both the search fan-out and the purchase boundary enforce this list, so the
// `@McpTool` "never offered" promise holds for every code path.
export const SUPPORTED_TLDS = [
  'run',
  'bio',
  'fyi',
  'win',
  'digital',
  'site',
] as const

const SUPPORTED_TLD_SET: ReadonlySet<string> = new Set(SUPPORTED_TLDS)

// True when `value`'s TLD (the segment after the last dot) is approved. A bare
// SLD with no dot returns false — it carries no TLD to approve.
export const hasSupportedTld = (value: string): boolean =>
  value.includes('.') &&
  SUPPORTED_TLD_SET.has(value.slice(value.lastIndexOf('.') + 1))

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
