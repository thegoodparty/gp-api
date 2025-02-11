import { Controller, UsePipes, Get, Query } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { VotersService } from './services/voters.service'
import { GetVoterLocationsSchema } from './schemas/GetVoterLocations.schema'

@Controller('voters')
@UsePipes(ZodValidationPipe)
export class VotersController {
  constructor(private readonly voters: VotersService) {}

  @Get('locations')
  getLocations(@Query() query: GetVoterLocationsSchema) {
    return this.voters.querySearchColumn(query.electionType, query.state)
  }
}
