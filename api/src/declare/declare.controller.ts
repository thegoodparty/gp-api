import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { DeclareService } from './declare.service';

@Controller('declare')
export class DeclareController {
  constructor(private readonly declareService: DeclareService) {}

  @Get('list')
  async listDeclarations() {
    try {
      return await this.declareService.getDeclarations();
    } catch (error) {
      console.error('Error at declare list:', error);
      throw new HttpException(
        { message: 'Error fetching declarations', error },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}