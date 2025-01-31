import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from '../../../prisma/util/prisma.util'

@Injectable()
export class PathToVictoryService extends createPrismaBase(
  MODELS.PathToVictory,
) {}
