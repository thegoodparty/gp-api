import { z } from 'zod'

export const P2V_STATUS_VALUES = ['Complete', 'Waiting', 'Failed', 'DistrictMatched'] as const
export type P2VStatus = (typeof P2V_STATUS_VALUES)[number]
export const P2VStatusSchema = z.enum(P2V_STATUS_VALUES)

export const P2V_SOURCE_VALUES = ['GpApi', 'ElectionApi'] as const
export type P2VSource = (typeof P2V_SOURCE_VALUES)[number]
export const P2VSourceSchema = z.enum(P2V_SOURCE_VALUES)
