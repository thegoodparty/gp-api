import { forwardRef, Global, Module } from '@nestjs/common'
import { FeaturesService } from './services/features.service'
import { UsersModule } from 'src/users/users.module'

@Global()
@Module({
  providers: [FeaturesService],
  exports: [FeaturesService],
  imports: [forwardRef(() => UsersModule)],
})
export class FeaturesModule {}
