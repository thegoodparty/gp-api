import { z } from 'zod'

export enum TextCampaignStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied',
  PAID = 'paid',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export const TextCampaignStatusSchema = z.nativeEnum(TextCampaignStatus)
