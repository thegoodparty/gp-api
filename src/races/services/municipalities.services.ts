import { Injectable } from '@nestjs/common'
import { BasePrismaService } from 'src/prisma/basePrisma.service'

@Injectable()
export class MunicipalitiesService extends BasePrismaService<'municipality'> {
  constructor() {
    super('municipality')
  }
}
