import { Injectable } from '@nestjs/common'
import { BasePrismaService } from 'src/prisma/basePrisma.service'

@Injectable()
export class CensusEntitiesService extends BasePrismaService<'censusEntity'> {
  constructor() {
    super('censusEntity')
  }
}
