import { Injectable } from '@nestjs/common'
import { PathToVictory } from '@prisma/client'
import { P2VStatus } from 'src/elections/types/pathToVictory.types'
import { PrismaService } from 'src/prisma/prisma.service'
import { DateFormats, formatDate } from 'src/shared/util/date.util'

@Injectable()
export class AdminP2VService {
  constructor(private prisma: PrismaService) {}

  // TODO: this should be moved to a more general P2V service
  // putting here until P2V stuff has been built out
  completeP2V(userId: number, pathToVictory: PathToVictory) {
    return this.prisma.pathToVictory.update({
      where: { id: pathToVictory.id },
      data: {
        data: {
          ...pathToVictory.data,
          p2vCompleteDate: formatDate(new Date(), DateFormats.isoDate),
          p2vStatus: P2VStatus.complete,
          completedBy: userId,
        },
      },
    })
  }
}
