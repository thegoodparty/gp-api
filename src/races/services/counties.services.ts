import { Injectable } from '@nestjs/common'
import { BasePrismaService } from 'src/prisma/basePrisma.service'

@Injectable()
export class CountiesService extends BasePrismaService<'county'> {
  constructor() {
    super('county')
  }
}
