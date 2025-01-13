import { Controller, Get } from '@nestjs/common'
import { DeclareService } from './declare.service'

@Controller('declare')
export class DeclareController {
  constructor(private readonly declareService: DeclareService) {}

  @Get('list')
  async listDeclarations() {
    return await this.declareService.getDeclarations()
  }
}
