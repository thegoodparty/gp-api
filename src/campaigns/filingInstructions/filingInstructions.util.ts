import { format, isValid, parseISO } from 'date-fns'
import { Campaign } from 'src/generated/prisma'
import type { RaceTargetMetrics } from '@goodparty_org/contracts'

// details.filingPeriods* are ISO date strings written by the filing-data
// pipeline, but `details` is a loosely-typed JSON column edited by several
// writers — an unparseable value would throw in `format` and 500 the email
// route, so fall back to the raw string rather than failing the send.
const formatFilingDate = (value: string | null | undefined): string | null => {
  if (!value) return null
  const parsed = parseISO(value)
  return isValid(parsed) ? format(parsed, 'MMMM d, yyyy') : value
}

const formatFilingWindow = (
  start: string | null | undefined,
  end: string | null | undefined,
): string => {
  const formattedStart = formatFilingDate(start)
  const formattedEnd = formatFilingDate(end)
  if (formattedStart && formattedEnd) {
    return `${formattedStart} – ${formattedEnd}`
  }
  return formattedStart ?? formattedEnd ?? 'Not yet available'
}

/**
 * Renders the plain-text "email this to me" body for the pre-payment
 * pro-upgrade wizard's filing-instructions screen (shown to candidates before
 * they subscribe): filing window (from `campaign.details`), plus fee /
 * requirements / office contact (from the live race-target metrics). Sections
 * with no data are omitted so the candidate never sees empty labels.
 */
export const renderFilingInstructionsEmail = (
  campaign: Campaign,
  metrics: RaceTargetMetrics | null,
): string => {
  const { filingPeriodsStart, filingPeriodsEnd } = campaign.details ?? {}

  const lines: string[] = [
    'Here are the filing instructions for your campaign.',
    '',
    `Filing window: ${formatFilingWindow(filingPeriodsStart, filingPeriodsEnd)}`,
  ]

  if (metrics?.filingFee != null) {
    lines.push(`Filing fee: $${metrics.filingFee}`)
  }
  if (metrics?.filingRequirementsText) {
    lines.push(`Filing requirements: ${metrics.filingRequirementsText}`)
  }

  const officeLines: string[] = []
  if (metrics?.filingOfficeAddress) {
    officeLines.push(`Address: ${metrics.filingOfficeAddress}`)
  }
  if (metrics?.filingPhoneNumber) {
    officeLines.push(`Phone: ${metrics.filingPhoneNumber}`)
  }
  if (metrics?.paperworkInstructions) {
    officeLines.push(`Instructions: ${metrics.paperworkInstructions}`)
  }
  if (officeLines.length > 0) {
    lines.push('', 'Filing office', ...officeLines)
  }

  return lines.join('\n')
}
