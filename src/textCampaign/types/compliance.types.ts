export enum TcrComplianceStatus {
  /** Form submitted, awaiting PIN confirmation */
  submitted = 'submitted',
  /** PIN confirmed, awaiting approval */
  pending = 'pending',
  /** Approved */
  approved = 'approved',
  /** Rejected */
  rejected = 'rejected',
}

export type TcrComplianceInfo = {
  /** Employer Identification Number */
  ein: string
  /** Address associated with the EIN */
  address: string
  /** Name associated with the EIN */
  name: string
  /** TCR compliant website domain */
  website: string
  /** Email address at compliant website domain */
  email: string
  /** PIN for verification - TODO: will this be a string token or number? */
  pin?: string
  /** Donation platform - TODO: do we need this? not used yet */
  donationPlatform?: string
  /** Current compliance status */
  status: TcrComplianceStatus
}
