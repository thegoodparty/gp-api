import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class CensusEntitiesService extends createPrismaBase(
  MODELS.CensusEntity,
) {}
