import { z } from 'zod'

export const SURVEY_STATUS_VALUES = ['Live', 'Not Live'] as const
export type SurveyStatus = (typeof SURVEY_STATUS_VALUES)[number]
export const SurveyStatusSchema = z.enum(SURVEY_STATUS_VALUES)
