import { Module } from '@nestjs/common';
import { TopIssuesController } from './top-issues.controller';
import { TopIssuesService } from './top-issues.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [TopIssuesController],
  providers: [TopIssuesService, PrismaService]
})
export class TopIssuesModule {}
