import { Controller, Get, Query, UsePipes } from '@nestjs/common'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { RacesService } from './services/races.service'
import { ZodValidationPipe } from 'nestjs-zod'
import { RacesByZipSchema } from './schemas/RacesByZip.schema'
import {
  GetDistrictNamesDTO,
  GetDistrictTypesDTO,
} from './schemas/districts.schema'
import { ElectionsService } from './services/elections.service'

@Controller('elections')
@PublicAccess()
@UsePipes(ZodValidationPipe)
export class ElectionsController {
  constructor(
    private readonly racesService: RacesService,
    private readonly elections: ElectionsService,
  ) {}

  @Get('races-by-year')
  async getRacesByZipcode(
    @Query() { zipcode, level, electionDate }: RacesByZipSchema,
  ) {
    return await this.racesService.getRacesByZip({
      zipcode,
      level,
      electionDate,
    })
  }

  @Get('districts/types')
  async getValidDistrictTypes(@Query() dto: GetDistrictTypesDTO) {
    return await this.elections.getValidDistrictTypes(
      dto.state,
      String(dto.electionYear),
    )
  }

  @Get('districts/names')
  async getValidDistrictNames(@Query() dto: GetDistrictNamesDTO) {
    return await this.elections.getValidDistrictNames(
      dto.L2DistrictType,
      dto.state,
      String(dto.electionYear),
    )
  }
}
