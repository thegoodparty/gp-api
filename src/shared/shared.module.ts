import { Global, Module } from '@nestjs/common'
import { EmailService } from './services/email.service'
import { PrismaService } from './services/prisma.service'

@Global()
@Module({
  providers: [EmailService, PrismaService],
  exports: [EmailService, PrismaService],
})
export class SharedModule {}
