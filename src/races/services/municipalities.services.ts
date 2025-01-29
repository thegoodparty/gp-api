import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/basePrisma.service'

@Injectable()
export class MunicipalitiesService extends createPrismaBase(
  MODELS.Municipality,
) {}
