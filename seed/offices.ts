import { PrismaClient } from '@prisma/client'
import { electedOfficeFactory } from './factories/electedOffice.factory'
import { BallotReadyPositionLevel } from '@goodparty_org/contracts'

export default async function seedOffices(email: string, prisma: PrismaClient) {
  const user = await prisma.user.findUnique({
    where: { email },
  })
  if (!user) {
    throw new Error(`User with email ${email} not found`)
  }

  const campaign = await prisma.campaign.findFirst({
    where: { userId: user.id },
  })
  if (!campaign) {
    throw new Error(`Campaign not found for user with email ${email}`)
  }

  // updating the campaign to match people-api seed data
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      details: {
        zip: '28739',
        filingPeriodsEnd: '2026-07-17',
        filingPeriodsStart: '2026-01-02',
        officeTermLength: '4 years',
        partisanType: 'nonpartisan',
        raceId: 'Z2lkOi8vYmFsbG90LWZhY3RvcnkvUG9zaXRpb25FbGVjdGlvbi8yNzcxNTEz',
        electionId: 'Z2lkOi8vYmFsbG90LWZhY3RvcnkvRWxlY3Rpb24vNTk5NA==',
        wonGeneral: true,
        ballotLevel: BallotReadyPositionLevel.CITY,
        electionDate: '2026-11-03',
        state: 'NC',
        party: 'independent',
      } satisfies PrismaJson.CampaignDetails,
      didWin: true,
      isDemo: false,
      isActive: true,
      isVerified: true,
    },
  })

  const electedOffice = electedOfficeFactory({
    userId: user.id,
    campaignId: campaign.id,
    organizationSlug: campaign.organizationSlug,
  })

  await prisma.organization.upsert({
    where: { slug: electedOffice.organizationSlug },
    update: {},
    create: {
      slug: electedOffice.organizationSlug,
      ownerId: user.id,
    },
  })

  const createdElectedOffice = await prisma.electedOffice.create({
    data: electedOffice,
  })
  console.log('Created elected office')
  return createdElectedOffice
}
