import { z } from 'zod'
import { PhoneSchema } from '@goodparty_org/contracts'
import {
  EinSchema,
  UrlOrDomainSchema,
  WriteEmailSchema,
} from '../../../shared/schemas'
import { createZodDto } from 'nestjs-zod'
import { CommitteeType, OfficeLevel } from '@prisma/client'
import { urlIncludesPath } from '../../../shared/util/strings.util'
import { Logger } from '@nestjs/common'

const logger = new Logger('CreateTcrComplianceDto')

export class CreateTcrComplianceDto extends createZodDto(
  z
    .object({
      ein: EinSchema,
      placeId: z.string(),
      formattedAddress: z.string(),
      committeeName: z.string(),
      websiteDomain: UrlOrDomainSchema,
      // Federal filingUrl enforcement below.
      filingUrl: UrlOrDomainSchema.refine(urlIncludesPath, {
        message:
          'Filing URL must include path (e.g. https://example.com/filing, not just https://example.com)',
      }),
      email: WriteEmailSchema,
      phone: PhoneSchema,
      officeLevel: z.nativeEnum(OfficeLevel),
      fecCommitteeId: z.string().optional(),
      committeeType: z.nativeEnum(CommitteeType).optional(),
    })
    .superRefine((data, ctx) => {
      const isFederal = data.officeLevel === OfficeLevel.federal

      if (isFederal) {
        // FEC Committee ID is required and must match pattern C + 8 digits.
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

        // Committee Type is required for federal and must be HOUSE, SENATE, or PRESIDENTIAL.
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

        // Filing URL must be from FEC.gov.
        if (!/fec\.gov/i.test(data.filingUrl)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Election Filing Link must be from FEC.gov for federal office level',
            path: ['filingUrl'],
          })
        }
      } else {
        // Else it's non-federal.

        if (data.fecCommitteeId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'FEC Committee ID should not be provided for non-federal office level',
            path: ['fecCommitteeId'],
          })
        }
        // Non-federal must use CANDIDATE committee type if provided.
        if (
          data.committeeType &&
          data.committeeType !== CommitteeType.CANDIDATE
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Committee Type must be CANDIDATE for non-federal office level',
            path: ['committeeType'],
          })
        }
      }
    })
    // TODO(ENG-6465): Remove this transform once FE is deployed and always sends committeeType.
    // After that, committeeType should always be present from the frontend.
    .transform((data) => {
      // committeeType provided - use it as-is.
      if (data.committeeType) {
        return { ...data, committeeType: data.committeeType }
      }

      // Non-federal without committeeType: default to CANDIDATE
      if (data.officeLevel !== OfficeLevel.federal) {
        logger.warn(
          `committeeType not provided for non-federal officeLevel "${data.officeLevel}", defaulting to CANDIDATE`,
        )
        return {
          ...data,
          committeeType: CommitteeType.CANDIDATE,
        }
      }

      // Federal without committeeType - superRefine should have caught this
      throw new Error(
        'committeeType is required for federal office level (validation should have caught this)',
      )
    }),
) {}
