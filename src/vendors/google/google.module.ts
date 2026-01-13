import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { GooglePlacesService } from './services/google-places.service'

@Module({
  imports: [HttpModule],
  providers: [GooglePlacesService],
  exports: [GooglePlacesService],
})
export class GoogleModule {}
