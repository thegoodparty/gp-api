import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { UsersService } from './users.service'
import { ReadUserOutputSchema } from './schemas/ReadUserOutput.schema'
import { User } from '@prisma/client'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { UserOwnerOrAdminGuard } from './guards/UserOwnerOrAdmin.guard'
import { GenerateSignedUploadUrlArgsDto } from './schemas/GenerateSignedUploadUrlArgs.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { UpdateMetadataSchema } from './schemas/UpdateMetadata.schema'
import { FilesService } from 'src/files/files.service'
import { FileUpload } from 'src/files/files.types'
import { ReqFile } from 'src/files/decorators/ReqFiles.decorator'
import { FilesInterceptor } from 'src/files/interceptors/files.interceptor'

@Controller('users')
@UsePipes(ZodValidationPipe)
export class UsersController {
  private readonly logger = new Logger(UsersController.name)

  constructor(
    private usersService: UsersService,
    private readonly filesService: FilesService,
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

  @Get('me/metadata')
  getMetadata(@ReqUser() { metaData }: User) {
    return metaData
  }

  @Put('me/metadata')
  updateMetadata(
    @ReqUser() user: User,
    @Body() { meta }: UpdateMetadataSchema,
  ) {
    return this.usersService.patchUserMetaData(user, meta)
  }

  @Post('me/upload-image')
  @UseInterceptors(FilesInterceptor('file', { mode: 'stream' }))
  async uploadImage(@ReqUser() user: User, @ReqFile() file?: FileUpload) {
    if (!file) {
      throw new BadRequestException('No file found')
    }

    const avatar = await this.filesService.uploadFile(file, 'uploads')
    const updatedUser = await this.usersService.updateUser(
      { id: user.id },
      { avatar },
    )
    return ReadUserOutputSchema.parse(updatedUser)
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
    return {
      signedUploadUrl: await this.filesService.generateSignedUploadUrl(args),
    }
  }
}
