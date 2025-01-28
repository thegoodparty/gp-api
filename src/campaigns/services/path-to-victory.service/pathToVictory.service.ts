import { Injectable } from '@nestjs/common'
import { BasePrismaService } from '../../../prisma/basePrisma.service'

@Injectable()
export class PathToVictoryService extends BasePrismaService<'pathToVictory'> {
  constructor() {
    super('pathToVictory')
  }
}
