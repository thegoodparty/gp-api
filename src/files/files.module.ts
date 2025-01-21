import { Module } from '@nestjs/common'
import { FilesService } from './files.service'
import { IntegrationsModule } from '../integrations/integrations.module'

@Module({
  imports: [IntegrationsModule],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
