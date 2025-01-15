import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Put,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { UsersService } from './users.service'
import { ReadUserOutputSchema } from './schemas/ReadUserOutput.schema'
import { User } from '@prisma/client'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { UserOwnerOrAdminGuard } from './guards/UserOwnerOrAdmin.guard'
import { AwsService } from '../aws/aws.service'
import { GenerateSignedUploadUrlArgsDto } from './schemas/GenerateSignedUploadUrlArgs.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { UpdateMetadataSchema } from './schemas/UpdateMetadata.schema'

@Controller('users')
@UsePipes(ZodValidationPipe)
export class UsersController {
  private readonly logger = new Logger(UsersController.name)

  constructor(
    private usersService: UsersService,
    private readonly aws: AwsService,
  ) {}

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

  @Get('me/meta')
  getMetadata(@ReqUser() { metaData }: User) {
    this.logger.log(metaData)
    return metaData
  }

  @Put('me/meta')
  updateMetadata(
    @ReqUser() user: User,
    @Body() { meta: inputMetadata }: UpdateMetadataSchema,
  ) {
    const { metaData } = user

    return this.usersService.updateUser(
      { id: user.id },
      {
        metaData: {
          ...metaData,
          ...inputMetadata,
        },
      },
    )
  }

  @UseGuards(UserOwnerOrAdminGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
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

  @Put('files/generate-signed-upload-url')
  async generateSignedUploadUrl(@Body() args: GenerateSignedUploadUrlArgsDto) {
    return { signedUploadUrl: await this.aws.generateSignedUploadUrl(args) }
  }
}
