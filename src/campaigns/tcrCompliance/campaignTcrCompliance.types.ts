import { CreateTcrComplianceDto } from './schemas/createTcrComplianceDto.schema'

export type CreateTcrCompliancePayload = Omit<
  CreateTcrComplianceDto,
  'placeId' | 'formattedAddress'
> & {
  placeId?: never
  formattedAddress?: never
}
