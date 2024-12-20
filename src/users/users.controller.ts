import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { UsersService } from './users.service'
import { ReadUserOutputSchema } from './schemas/ReadUserOutput.schema'
import { User } from '@prisma/client'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { UserOwnerOrAdminGuard } from './guards/UserOwnerOrAdmin.guard'
import { Roles } from '../authentication/decorators/Roles.decorator'
import { CreateUserInputDto } from './schemas/CreateUserInput.schema'
import { generateRandomPassword } from './util/passwords.util'

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name)

  constructor(private usersService: UsersService) {}

  @Roles('admin')
  @Post()
  async create(@Body() userData: CreateUserInputDto) {
    const password = userData.password || generateRandomPassword()
    return await this.usersService.createUser({ ...userData, password })
  }

  @UseGuards(UserOwnerOrAdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string, @ReqUser() user: User) {
    const paramId = parseInt(id)
    if (paramId === user.id) {
      // No need to hit the DB again if the user is requesting their own data
      return ReadUserOutputSchema.parse(user)
    }

    const dbUser = await this.usersService.findUser({ id: paramId })
    if (!dbUser) {
      throw new NotFoundException('User not found')
    }
    return ReadUserOutputSchema.parse(dbUser)
  }

  @Get('me')
  async findMe(@ReqUser() user: User) {
    return ReadUserOutputSchema.parse(
      await this.usersService.findUser({ id: user.id }),
    )
  }

  @UseGuards(UserOwnerOrAdminGuard)
  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string) {
    try {
      return await this.usersService.deleteUser(parseInt(id))
    } catch (e: Error | any) {
      if (e?.code !== 'P2025') {
        // P2025: Prisma error code for "Record to delete does not exist"
        throw e
      }
      this.logger.warn(
        `request to delete user that does not exist, w/ id: ${id}`,
      )
    }
  }
}
