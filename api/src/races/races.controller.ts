import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common'
import { RacesService } from './races.service'
import { CreateRaceDto } from './dto/create-race.dto'
import { UpdateRaceDto } from './dto/update-race.dto'

@Controller('races')
export class RacesController {
  constructor(private readonly racesService: RacesService) {}

  @Get()
  findRaces(
    @Query('state') state?: string,
    @Query('county') county?: string,
    @Query('city') city?: string,
    @Query('positionSlug') positionSlug?: string,
  ) {
    if (state && county && city && positionSlug) {
      return this.racesService.findOne(state, county, city, positionSlug)
    }
  }

  @Get('seed')
  seed() {
    return this.racesService.seed()
  }
}
