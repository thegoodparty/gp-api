import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreatePositionSchema } from './schemas/CreatePosition.schema'
import { UpdatePositionSchema } from './schemas/UpdatePosition.schema'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class PositionsService {
  constructor(
    private prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PositionsService.name)
  }

  async findAll() {
    const positions = await this.prisma.position.findMany({
      include: {
        topIssue: true,
      },
      orderBy: { name: 'asc' },
    })

    return positions.filter((pos) => !!pos.topIssue)
  }

  create({ name, topIssueId }: CreatePositionSchema) {
    return this.prisma.position.create({
      data: {
        name,
        topIssueId,
      },
    })
  }

  update(id: number, { name }: UpdatePositionSchema) {
    return this.prisma.position.update({
      where: { id },
      data: {
        name,
      },
    })
  }

  async delete(id: number) {
    return this.prisma.position.delete({ where: { id } })
  }
}
