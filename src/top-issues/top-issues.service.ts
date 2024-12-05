import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { CreateTopIssueDto, TopIssueOutputDto, UpdateTopIssueDto } from './schemas/topIssues.schema';
import { PrismaService } from 'src/prisma/prisma.service';
import { TopIssue } from '@prisma/client';
import { PrismaClientValidationError } from '@prisma/client/runtime/library';

@Injectable()
export class TopIssuesService {
  private readonly logger = new Logger(TopIssuesService.name);
  constructor(private prismaService: PrismaService) {}

  async create(body: CreateTopIssueDto): Promise<TopIssueOutputDto> {
    const { name, icon } = body;

    try {
      const { id } = await this.prismaService.topIssue.create({
        data: {
          name, 
          icon
        }
      })

      return {
        id,
        name,
        icon
      }
    } catch (error: unknown) {
      if (error instanceof PrismaClientValidationError) {
        this.logger.error(`Validation error ${error.message}`, error.stack);
        throw new BadRequestException('Failed to create Top Issue - ' + error.message);
      }
      if (error instanceof Error) {
        this.logger.error(`Failed to create Top Issue ${error.message}`, error.stack);
        throw new InternalServerErrorException('An unexpected error occured.');
      }
      throw error;
    }
  }

  async update(id: number, body: UpdateTopIssueDto): Promise<TopIssue> {
    const { name, icon } = body;
    try {
      return await this.prismaService.topIssue.update({
        where: { id },
        data: { name, icon }
      });
    } catch (error) {
      if (error instanceof PrismaClientValidationError) {
        this.logger.error(`Validation error: ${error.message}`, error.stack);
        throw new BadRequestException('Failed to update Top Issue - ' + error.message);
      } else if (error instanceof Error) {
        this.logger.error(`Failed to update Top Issue: ${error.message}`, error.stack);
        throw new InternalServerErrorException('An unexpected error occurred.');
      }
      throw error;
    }
  }

  async delete(id: number): Promise<void> {
    const issue = await this.prismaService.topIssue.findUnique({
      where: { id },
      include: {
        positions: true,
        campaignPositions: true,
        campaigns: true,
      },
    });

    if (!issue) {
      this.logger.error(`Failed to delete Top Issue with id ${id}`);
      throw new NotFoundException(`Top issue with id ${id} not found`);
    }

    const positionIds = issue.positions.map((position) => position.id);
    const campaignPositionIds = issue.campaignPositions.map((cp) => cp.id);
    

    await this.prismaService.$transaction(async (prisma) => {
      if (campaignPositionIds.length > 0) {
        await prisma.campaignPosition.deleteMany({
          where: { id: { in: campaignPositionIds } },
        });
      }

      if (positionIds.length > 0) {
        await prisma.position.deleteMany({
          where: { id: { in: positionIds } },
        });
      }

      await prisma.topIssue.delete({
        where: { id },
      });
    });
  }

  async list(): Promise<TopIssue[]> {
    const topIssues = await this.prismaService.topIssue.findMany({
      include: { positions: true }
    })

    for (let topIssue of topIssues) {
      if (topIssue.positions && Array.isArray(topIssue.positions)) {
        topIssue.positions.sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    return topIssues;
  }


}
