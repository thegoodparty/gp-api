import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { svgUploader } from 'src/shared/util/svgUploader.util';
import * as crypto from 'crypto';
import { CreateTopIssueDto, TopIssueOutputDto, CreateTopIssueSchema, DeleteTopIssueDto, UpdateTopIssueDto, UpdateTopIssueSchema } from './schemas/topIssues.schema';
import { s3DeleteFile } from 'src/shared/util/s3DeleteFile.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { Campaign, TopIssue } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { toNamespacedPath } from 'path';
import { PrismaClientValidationError } from '@prisma/client/runtime/library';

const assetsBase = process.env.ASSETS_BASE;

@Injectable()
export class TopIssuesService {
  private readonly logger = new Logger(TopIssuesService.name);
  constructor(private prismaService: PrismaService) {}

  async create(body: CreateTopIssueDto): Promise<TopIssueOutputDto> {
    const { name, icon } = body;

    try {
      const { id } = await this.prismaService.topIssue.create({
        data: {
          name: name,
        }
      })

      return {
        id,
        name,
        icon
      }
    } catch (error: any) {
      // if (error instanceof error) {

      // }
      this.logger.error(`Failed to create Top Issue ${error.message}`,
        error?.response?.data || error.stack
      )

      //        `Failed to fetch data from HubSpot API: ${error.message}`,
      //error?.response?.data || error.stack,
      if (error instanceof PrismaClientValidationError) {
        throw new BadRequestException(
          'Failed to create Top Issue - ' + error.name
        );
      }

      throw error;
    }
  }

  async delete(param: DeleteTopIssueDto) {
    const { id } = param;
    const issue = await this.prismaService.topIssue.findUnique({
      where: { id },
      include: {
        positions: true,
        campaignPositions: true,
        campaigns: true,
      },
    });

    if (!issue) {
      this.logger.error(`Top issue with id ${id} not found`);
      throw new NotFoundException(`Top issue with id ${id} not found`);
    }

    const positionsLength = issue.positions.length; // Caching for performance
    const positionIds = new Array<number>(positionsLength);
    for (let i = 0; i < positionsLength; i++) {
      positionIds[i] = issue.positions[i].id;
    }

    const campaignsLength = issue.campaigns.length;
    const campaignIds = new Array<number>(campaignsLength);
    for (let i = 0; i < campaignsLength; i++) {
      campaignIds[i] = issue.campaigns[i].id;
    }

    const campaignPositionsLength = issue.campaignPositions.length;
    const campaignPositionIds = new Array<number>(campaignPositionsLength);
    for (let i = 0; i < campaignPositionsLength; i++) {
      campaignPositionIds[i] = issue.campaignPositions[i].id;
    }

    await this.prismaService.$transaction(async (prisma) => {
      if (campaignPositionIds.length > 0) {
        await this.prismaService.campaignPosition.deleteMany({
          where: { id: { in: campaignPositionIds } },
        });
      }

      if (positionIds.length > 0) {
        await this.prismaService.position.deleteMany({
          where: { id: { in: positionIds } },
        });
      }

      // !! Do I actually need to do this???
      //
      // if (campaignIds.length > 0) {
      //   const disconnectTopIssuePromises: Promise<Campaign>[] = [];
      //   for (let i = 0; i < campaignsLength; i++) {
      //     const campaignId = campaignIds[i];
      //     disconnectTopIssuePromises.push(
      //       this.prismaService.campaign.update({
      //         where: { id: campaignId },
      //         data: {
      //           topIssues: {
      //             disconnect: { id },
      //           },
      //         },
      //       })
      //     );
      //   }
      //   await Promise.all(disconnectTopIssuePromises);
      // }

      await this.prismaService.topIssue.delete({
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

  async update(body: UpdateTopIssueDto): Promise<UpdateTopIssueDto> {
    const { id, name, icon } = body;
    await this.prismaService.topIssue.update({
      where: { id },
      data: {
        name: name,
      }
    })

    return {
      id,
      name,
      icon,
    }
  }
}
