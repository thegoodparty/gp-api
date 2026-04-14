import { z } from 'zod'
import { ReadCampaignOutputSchema } from './ReadCampaignOutput.schema'

export const SetDistrictOutputSchema = ReadCampaignOutputSchema

export type SetDistrictOutput = z.infer<typeof SetDistrictOutputSchema>
