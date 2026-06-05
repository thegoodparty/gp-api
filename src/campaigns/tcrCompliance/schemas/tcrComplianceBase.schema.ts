import { z } from 'zod'
import { PhoneSchema } from '@goodparty_org/contracts'
import {
  EinSchema,
  UrlOrDomainSchema,
  WriteEmailSchema,
} from '../../../shared/schemas'
import { CommitteeType, OfficeLevel } from '../../../generated/prisma'
import { urlIncludesPath } from '../../../shared/util/strings.util'
import { Logger } from '@nestjs/common'

const logger = new Logger('TcrComplianceDto')

export const tcrComplianceBaseShape = {
  ein: EinSchema,
  placeId: z.string(),
  formattedAddress: z.string(),
  committeeName: z.string(),
  filingUrl: UrlOrDomainSchema.refine(urlIncludesPath, {
    message:
      'Filing URL must include path (e.g. https://example.com/filing, not just https://example.com)',
  }),
  email: WriteEmailSchema,
  phone: PhoneSchema,
  officeLevel: z.nativeEnum(OfficeLevel),
  fecCommitteeId: z.string().optional(),
  committeeType: z.nativeEnum(CommitteeType).optional(),
}

type TcrComplianceBaseData = {
  officeLevel: OfficeLevel
  fecCommitteeId?: string
  committeeType?: CommitteeType
  filingUrl: string
}

export const tcrComplianceSuperRefine = <T extends TcrComplianceBaseData>(
  data: T,
  ctx: z.RefinementCtx,
) => {
  const isFederal = data.officeLevel === OfficeLevel.federal

  if (isFederal) {
    if (!data.fecCommitteeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'FEC Committee ID is required for federal office level',
        path: ['fecCommitteeId'],
      })
    } else if (!/^C\d{8}$/.test(data.fecCommitteeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'FEC Committee ID must be "C" followed by 8 digits (e.g., C00123456)',
        path: ['fecCommitteeId'],
      })
    }

    const federalCommitteeTypes = new Set<CommitteeType>([
      CommitteeType.HOUSE,
      CommitteeType.SENATE,
      CommitteeType.PRESIDENTIAL,
    ])
    if (!data.committeeType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Committee Type is required for federal office level',
        path: ['committeeType'],
      })
    } else if (!federalCommitteeTypes.has(data.committeeType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Committee Type must be HOUSE, SENATE, or PRESIDENTIAL for federal office level',
        path: ['committeeType'],
      })
    }

    if (!/fec\.gov/i.test(data.filingUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Election Filing Link must be from FEC.gov for federal office level',
        path: ['filingUrl'],
      })
    }
  } else {
    if (data.fecCommitteeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'FEC Committee ID should not be provided for non-federal office level',
        path: ['fecCommitteeId'],
      })
    }
    if (data.committeeType && data.committeeType !== CommitteeType.CANDIDATE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Committee Type must be CANDIDATE for non-federal office level',
        path: ['committeeType'],
      })
    }
  }
}

export const tcrComplianceTransform = <T extends TcrComplianceBaseData>(
  data: T,
): T & { committeeType: CommitteeType } => {
  if (data.committeeType) {
    return { ...data, committeeType: data.committeeType }
  }

  if (data.officeLevel !== OfficeLevel.federal) {
    logger.warn(
      `committeeType not provided for non-federal officeLevel "${data.officeLevel}", defaulting to CANDIDATE`,
    )
    return { ...data, committeeType: CommitteeType.CANDIDATE }
  }

  throw new Error(
    'committeeType is required for federal office level (validation should have caught this)',
  )
}
