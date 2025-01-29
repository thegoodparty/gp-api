import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/basePrisma.service'

@Injectable()
export class CensusEntitiesService extends createPrismaBase(
  MODELS.CensusEntity,
) {}
