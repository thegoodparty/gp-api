import { Injectable } from '@nestjs/common'
import { CreateRaceDto } from './dto/create-race.dto'
import { UpdateRaceDto } from './dto/update-race.dto'

@Injectable()
export class RacesService {
  create(createRaceDto: CreateRaceDto) {
    return 'This action adds a new race'
  }

  findAll() {
    return `This action returns all races`
  }

  findOne(id: number) {
    return `This action returns a #${id} race`
  }

  update(id: number, updateRaceDto: UpdateRaceDto) {
    return `This action updates a #${id} race`
  }

  remove(id: number) {
    return `This action removes a #${id} race`
  }
}
