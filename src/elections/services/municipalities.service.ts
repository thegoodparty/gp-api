import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class MunicipalitiesService extends createPrismaBase(
  MODELS.Municipality,
) {}
