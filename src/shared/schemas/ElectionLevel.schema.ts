import { z } from 'zod'
import { LEVELS } from '../constants/governmentLevels'

export const ElectionLevelSchema = z.string().toUpperCase().pipe(z.enum(LEVELS))
