import { NotFoundException } from '@nestjs/common'
import { ElectedOffice, PrismaClient } from '@prisma/client'
import { parseIsoDateAsUTC } from '@/shared/util/date.util'

export async function resolveBriefingId(
  prisma: Pick<PrismaClient, 'meetingBriefing'>,
  meetingDate: string,
  electedOffice: Pick<ElectedOffice, 'id'>,
): Promise<string> {
  const briefing = await prisma.meetingBriefing.findUnique({
    where: {
      electedOfficeId_meetingDate: {
        electedOfficeId: electedOffice.id,
        meetingDate: parseIsoDateAsUTC(meetingDate),
      },
    },
    select: { id: true },
  })
  if (!briefing) throw new NotFoundException('briefing_not_found')
  return briefing.id
}
