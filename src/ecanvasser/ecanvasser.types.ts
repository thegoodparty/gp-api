import { Prisma } from '@prisma/client'

export type EcanvasserWithRelations = Prisma.EcanvasserGetPayload<{
  include: {
    appointments: true
    contacts: true
    customFields: true
    documents: true
    efforts: true
    followUps: true
    houses: true
    interactions: true
    surveys: true
    surveyQuestions: true
    teams: true
    users: true
    campaign: {
      select: {
        id: true
        user: {
          select: {
            email: true
          }
        }
      }
    }
  }
}>

export type EcanvasserSummary = {
  appointments: number
  contacts: number
  customFields: number
  documents: number
  efforts: number
  followUps: number
  houses: number
  interactions: number
  surveys: number
  questions: number
  teams: number
  users: number
  email: string | null
  campaignId: number
  lastSync: Date | null
  error: string | null
}
