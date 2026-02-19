import { z } from 'zod'
import { P2VStatus } from 'src/elections/types/pathToVictory.types'
import { P2VSource } from 'src/pathToVictory/types/pathToVictory.types'

const viabilityScoreSchema = z.object({
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

export const PathToVictoryDataSchema = z
  .object({
    p2vStatus: z.nativeEnum(P2VStatus).optional(),
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
    viability: viabilityScoreSchema.optional(),
    source: z.nativeEnum(P2VSource).optional(),
    districtId: z.string().optional(),
    districtManuallySet: z.boolean().optional(),
    officeContextFingerprint: z.string().optional(),
  })
  .strip()
