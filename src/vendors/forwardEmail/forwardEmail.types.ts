interface ForwardEmailDomainDnsRecordKV {
  name: string
  value: string
}

interface ForwardEmailDomainSmtpDnsRecords {
  dkim?: ForwardEmailDomainDnsRecordKV
  return_path?: ForwardEmailDomainDnsRecordKV
  dmarc?: ForwardEmailDomainDnsRecordKV
}

export interface ForwardEmailDomainResponse {
  has_newsletter?: boolean
  ignore_mx_check?: boolean
  has_delivery_logs?: boolean
  retention_days?: number
  has_regex?: boolean
  has_catchall?: boolean
  allowlist?: string[]
  denylist?: string[]
  restricted_alias_names?: string[]
  has_adult_content_protection?: boolean
  has_phishing_protection?: boolean
  has_executable_protection?: boolean
  has_virus_protection?: boolean
  is_catchall_regex_disabled?: boolean
  has_smtp?: boolean
  is_smtp_suspended?: boolean
  plan?: string
  max_recipients_per_alias?: number
  smtp_port?: string
  name?: string
  has_mx_record?: boolean
  has_txt_record?: boolean
  has_dkim_record?: boolean
  has_return_path_record?: boolean
  has_dmarc_record?: boolean
  has_recipient_verification?: boolean
  has_custom_verification?: boolean
  verification_record?: string
  id?: string
  object?: 'domain'
  created_at?: string
  updated_at?: string
  storage_used?: number
  storage_used_by_aliases?: number
  storage_quota?: number
  smtp_dns_records?: ForwardEmailDomainSmtpDnsRecords
  link?: string
}

export interface ForwardEmailAliasUser {
  email: string
  display_name: string
  id: string
}

export interface ForwardEmailAliasDomain {
  name: string
  id: string
}

export interface ForwardEmailAliasResponse {
  user: ForwardEmailAliasUser
  domain: ForwardEmailAliasDomain
  name: string
  labels: string[]
  is_enabled: boolean
  has_recipient_verification: boolean
  verified_recipients: string[]
  pending_recipients: string[]
  recipients: string[]
  id: string
  object: 'alias'
  created_at: string
  updated_at: string
  storage_location: string
  has_imap: boolean
}

interface CreateDomainInput {
  domain: string
}

interface CreateAliasInput {
  name?: string
  recipients?: string | string[]
  description?: string
  labels?: string | string[]
  has_recipient_verification?: boolean
  is_enabled?: boolean
  error_code_if_disabled?: 250 | 421 | 550
  has_imap?: boolean
  has_pgp?: boolean
  public_key?: string
  max_quota?: string
  vacation_responder_is_enabled?: boolean
  vacation_responder_start_date?: string
  vacation_responder_end_date?: string
  vacation_responder_subject?: string
  vacation_responder_message?: string
}
