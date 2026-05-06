import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { RaceListItemArraySchema } from '@goodparty_org/contracts'
import { Controller, Get, Query, UsePipes } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { RacesByZipSchema } from './schemas/RacesByZip.schema'
import {
  GetDistrictNamesDTO,
  GetDistrictTypesDTO,
} from './schemas/districts.schema'
import { ElectionsService } from './services/elections.service'
import { RacesService } from './services/races.service'

@Controller('elections')
@PublicAccess()
@UsePipes(ZodValidationPipe)
export class ElectionsController {
  constructor(
    private readonly racesService: RacesService,
    private readonly elections: ElectionsService,
  ) {}

  @Get('races-by-year')
  @ResponseSchema(RaceListItemArraySchema)
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
      dto.electionYear,
      dto.excludeInvalid,
    )
  }

  @Get('districts/names')
  async getValidDistrictNames(@Query() dto: GetDistrictNamesDTO) {
    return await this.elections.getValidDistrictNames(
      dto.L2DistrictType,
      dto.state,
      dto.electionYear,
      dto.excludeInvalid,
    )
  }
}
