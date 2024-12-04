import { Injectable, NotFoundException } from '@nestjs/common';
import { svgUploader } from 'src/shared/util/svgUploader.util';
import * as crypto from 'crypto';
import { CreateTopIssueSchema } from './schemas/topIssues.schema';
import { s3DeleteFile } from 'src/shared/util/s3DeleteFile.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { Campaign } from '@prisma/client';
import { Prisma } from '@prisma/client';

const assetsBase = process.env.ASSETS_BASE;

function md5(data: string) {
  return crypto.createHash('md5').update(data).digest('hex');
}

@Injectable()
export class TopIssuesService {
  constructor(private prismaService: PrismaService) {}

  async create(body: CreateTopIssueSchema): Promise<object> {
    const { name, icon } = body;

    const { id } = await this.prismaService.topIssue.create({
      data: {
        name: name,
      }
    })

    const iconUrl = icon
      ? await svgUploader(
        `topissue-icon-${id}-${md5(icon)}.svg`,
        'top-issue-icons',
        icon,
      )
    : null;

    const updatedTopIssue = await this.prismaService.topIssue.update({
      where: { id },
      data: { icon: iconUrl },
    });

    return {
      id: updatedTopIssue.id,
      name: updatedTopIssue.name,
      icon: updatedTopIssue.icon,
    }
  }

  async delete(id: number) {
    const issue = await this.prismaService.topIssue.findUnique({
      where: { id },
      include: {
        positions: true,
        campaignPositions: true,
        campaigns: true,
      },
    });

    if (!issue) {
      throw new NotFoundException(`Top issue with id ${id} not found`);
    }  

    const { icon } = issue;

    if (icon) {
      await s3DeleteFile(
        `${assetsBase}/top-issue-icons`,
        `top-issue-icons/${id}-topissue-icon.svg`,
      );
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

      if (campaignIds.length > 0) {
        const disconnectTopIssuePromises: Promise<Campaign>[] = [];
        for (let i = 0; i < campaignsLength; i++) {
          const campaignId = campaignIds[i];
          disconnectTopIssuePromises.push(
            this.prismaService.campaign.update({
              where: { id: campaignId },
              data: {
                topIssues: {
                  disconnect: { id },
                },
              },
            })
          );
        }
        await Promise.all(disconnectTopIssuePromises);
      }

      await this.prismaService.topIssue.delete({
        where: { id },
      });
    });
  }
}
