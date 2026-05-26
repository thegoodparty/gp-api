import { z } from 'zod'
import { ComplianceStageSchema } from './enums'

export const SubmitToPeerlyPinDeliveryChannelsSchema = z.object({
  email: z.string(),
  phone: z.string(),
})

export type SubmitToPeerlyPinDeliveryChannels = z.infer<
  typeof SubmitToPeerlyPinDeliveryChannelsSchema
>

export const SubmitToPeerlyOutputSchema = z.object({
  tcrComplianceId: z.string(),
  peerlyIdentityId: z.string(),
  peerlyIdentityProfileLink: z.string().nullable(),
  peerly10DLCBrandSubmissionKey: z.string().nullable(),
  peerlyVerificationId: z.string().nullable(),
  stage: ComplianceStageSchema,
  pinDeliveryChannels: SubmitToPeerlyPinDeliveryChannelsSchema,
})

export type SubmitToPeerlyOutput = z.infer<typeof SubmitToPeerlyOutputSchema>
