import { CreateTcrComplianceDto } from './schemas/createTcrComplianceDto.schema'
import { CreateAgenticTcrComplianceDto } from './schemas/createAgenticTcrComplianceDto.schema'

export type CreateTcrCompliancePayload = Omit<
  CreateTcrComplianceDto,
  'placeId' | 'formattedAddress'
> & {
  placeId?: never
  formattedAddress?: never
}

export type CreateAgenticTcrCompliancePayload = Omit<
  CreateAgenticTcrComplianceDto,
  'placeId' | 'formattedAddress'
> & {
  placeId?: never
  formattedAddress?: never
}
