import { z } from 'zod'
import { P2VStatusSchema, P2VSourceSchema } from './enums'

const ViabilityScoreSchema = z.object({
  level: z.string(),
  isPartisan: z.boolean(),
  isIncumbent: z.boolean(),
  isUncontested: z.boolean(),
  candidates: z.number(),
  seats: z.number(),
  candidatesPerSeat: z.number(),
  score: z.number(),
  probOfWin: z.number(),
})

const PathToVictoryDataSchema = z.object({
  p2vStatus: P2VStatusSchema.optional(),
  p2vAttempts: z.number().optional(),
  p2vCompleteDate: z.string().optional(),
  completedBy: z.number().optional(),
  electionType: z.string().optional(),
  electionLocation: z.string().optional(),
  voterContactGoal: z.number().optional(),
  winNumber: z.number().optional(),
  p2vNotNeeded: z.boolean().optional(),
  totalRegisteredVoters: z.number().optional(),
  republicans: z.number().optional(),
  democrats: z.number().optional(),
  indies: z.number().optional(),
  women: z.number().optional(),
  men: z.number().optional(),
  white: z.number().optional(),
  asian: z.number().optional(),
  africanAmerican: z.number().optional(),
  hispanic: z.number().optional(),
  averageTurnout: z.number().optional(),
  projectedTurnout: z.number().optional(),
  viability: ViabilityScoreSchema.optional(),
  source: P2VSourceSchema.optional(),
  districtId: z.string().optional(),
  districtManuallySet: z.boolean().optional(),
  officeContextFingerprint: z.string().optional(),
})

export const UpdatePathToVictoryInputSchema = z.object({
  data: PathToVictoryDataSchema.strict(),
})

export type UpdatePathToVictoryInput = z.infer<typeof UpdatePathToVictoryInputSchema>
