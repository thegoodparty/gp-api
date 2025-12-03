import { Controller, Get, Query, UsePipes } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { ElectionsService } from 'src/elections/services/elections.service'
import { GetVoterLocationsSchema } from './schemas/GetVoterLocations.schema'

@Controller('voters')
@UsePipes(ZodValidationPipe)
export class VotersController {
  constructor(private readonly elections: ElectionsService) {}

  @Get('locations')
  getLocations(@Query() query: GetVoterLocationsSchema) {
    // Serve district names from election-api (clean labels)
    return this.elections.getValidDistrictNames(query.electionType, query.state)
  }
}
