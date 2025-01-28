import { forwardRef, Module } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { FilesModule } from 'src/files/files.module'
import { FullStoryModule } from '../fullStory/fullStory.module'
import { AuthenticationModule } from '../authentication/authentication.module'

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
  imports: [
    FilesModule,
    FullStoryModule,
    forwardRef(() => AuthenticationModule),
  ],
})
export class UsersModule {}
