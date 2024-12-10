import { Module } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { EmailModule } from 'src/email/email.module'

@Module({
  providers: [UsersService],
  exports: [UsersService],
  imports: [EmailModule],
  controllers: [UsersController],
})
export class UsersModule {}
