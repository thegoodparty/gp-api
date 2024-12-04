import { Injectable, NotFoundException } from '@nestjs/common';
import { svgUploader } from 'src/shared/util/svgUploader.util';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { CreateTopIssueSchema, DeleteTopIssueSchema } from './schemas/topIssues.schema';
import { s3DeleteFile } from 'src/shared/util/s3DeleteFile.util';

const prisma = new PrismaClient();
const assetsBase = process.env.ASSETS_BASE;

function md5(data: string) {
  return crypto.createHash('md5').update(data).digest('hex');
}

@Injectable()
export class TopIssuesService {

  async create(body: CreateTopIssueSchema): Promise<object> {
    const { name, icon } = body;

    const { id } = await prisma.topIssue.create({
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

    const updatedTopIssue = await prisma.topIssue.update({
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
    const issue = await prisma.topIssue.findUnique({
      where: { id },
      include: {
        positions: true,
        campaigns: true,
      }
    });

    if (!issue) {
      throw new NotFoundException(`Top issue with id ${id} not found`);
    }    
    const { icon } = issue;

    icon &&
      (await s3DeleteFile(
        `${assetsBase}/top-issue-icons`,
        `top-issue-icons/${id}-topissue-icon.svg`,
      ));
    
    const positionsLength = issue.positions.length; // Caching for performance
    for (let i = 0; i < positionsLength; i++) {
      const positionId = issue.positions[i].id;
      const position = await prisma.position.findUnique({
        where: { id: positionId },
        include: {
          campaigns: true
        }
      })
    }
  }
}
