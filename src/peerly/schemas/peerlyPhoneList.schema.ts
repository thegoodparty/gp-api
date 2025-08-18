import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const uploadPhoneListResponseSchema = z.object({
  Data: z.object({
    token: z.string(),
    account_id: z.string().optional(),
    list_name: z.string().optional(),
    list_state: z.string().optional(),
    pending_list_id: z.number().optional(),
  }),
})

const phoneListStatusResponseSchema = z.object({
  Data: z.object({
    list_status: z.string().optional(),
    list_state: z.string().optional(),
    list_id: z.number().optional(),
  }),
})

const phoneListDetailsResponseSchema = z.object({
  leads_duplicate: z.number(),
  leads_master_dnc: z.number(),
  leads_cell_dnc: z.number(),
  leads_malformed: z.number(),
  leads_loaded: z.number(),
  use_nat_dnc: z.number(),
  suppress_cell_phones: z.number(),
  account_id: z.string(),
  leads_acct_dnc: z.number(),
  list_name: z.string(),
  list_state: z.string(),
  list_id: z.number(),
  leads_cell_suppressed: z.number(),
  leads_supplied: z.number(),
  leads_invalid: z.number(),
  leads_nat_dnc: z.number(),
  upload_by: z.string(),
  shared: z.number(),
  upload_date: z.string(),
})

export class UploadPhoneListResponseDto extends createZodDto(
  uploadPhoneListResponseSchema,
) {}
export class PhoneListStatusResponseDto extends createZodDto(
  phoneListStatusResponseSchema,
) {}
export class PhoneListDetailsResponseDto extends createZodDto(
  phoneListDetailsResponseSchema,
) {}
