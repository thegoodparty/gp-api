import { Injectable } from '@nestjs/common';
import { svgUploader } from 'src/shared/util/svgUploader.util';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { CreateTopIssueSchema } from './schemas/topIssues.schema';

const prisma = new PrismaClient();

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

  //async delete(id: number)
}
