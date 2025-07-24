import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  ParseIntPipe,
  HttpStatus,
  HttpCode,
  Logger,
  BadRequestException,
  NotFoundException
} from '@nestjs/common'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { PublicUsersService } from '../services/public-users.service'
import { FindByOfficeDto } from '../schemas/public/FindByOffice.schema'
import { 
  FindByOfficeResponseDto 
} from '../schemas/public/FindByOfficeResponse.schema'
import { 
  UserProfileResponseDto 
} from '../schemas/public/UserProfile.schema'

@Controller('public-users')
@PublicAccess()
export class PublicUsersController {
  private readonly logger = new Logger(PublicUsersController.name)

  constructor(
    private readonly publicUsersService: PublicUsersService,
  ) {}

  @Post('find-by-office')
  @HttpCode(HttpStatus.OK)
  async findByOffice(
    @Body() dto: FindByOfficeDto
  ): Promise<FindByOfficeResponseDto> {
    try {
      this.logger.debug(`Finding user by office: ${dto.office}, state: ${dto.state}`)
      
      const result = await this.publicUsersService.findUserByOffice(dto)
      
      if (result.userId) {
        this.logger.debug(`Found user ${result.userId} with confidence ${result.confidence}`)
      } else {
        this.logger.debug(`No user found for ${dto.firstName} ${dto.lastName}`)
      }
      
      return result
    } catch (error) {
      this.logger.error('Error in findByOffice:', error)
      throw new BadRequestException('Failed to search for user')
    }
  }

  @Get(':id/profile')
  async getUserProfile(
    @Param('id', ParseIntPipe) userId: number
  ): Promise<UserProfileResponseDto> {
    try {
      this.logger.debug(`Getting profile for user ${userId}`)
      
      const profile = await this.publicUsersService.getUserProfile(userId)
      
      if (!profile) {
        throw new NotFoundException(`User with ID ${userId} not found`)
      }
      
      return profile
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error
      }
      
      this.logger.error('Error in getUserProfile:', error)
      throw new BadRequestException('Failed to retrieve user profile')
    }
  }
} 