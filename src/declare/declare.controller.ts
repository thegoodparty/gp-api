import { Controller, Get } from '@nestjs/common'
import { DeclareService } from './declare.service'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'

@Controller('declare')
export class DeclareController {
  constructor(private readonly declareService: DeclareService) {}

  @Get('list')
  @PublicAccess()
  async listDeclarations() {
    return await this.declareService.getDeclarations()
  }
}
