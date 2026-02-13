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
  Query,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { UsersService } from './services/users.service'
import { ReadUserOutputSchema } from './schemas/ReadUserOutput.schema'
import { User } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { UserOwnerOrAdminGuard } from './guards/UserOwnerOrAdmin.guard'
import { GenerateSignedUploadUrlArgsDto } from './schemas/GenerateSignedUploadUrlArgs.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { UpdateMetadataSchema } from './schemas/UpdateMetadata.schema'
import { FilesService } from 'src/files/files.service'
import { FileUpload } from 'src/files/files.types'
import { ReqFile } from 'src/files/decorators/ReqFiles.decorator'
import { FilesInterceptor } from 'src/files/interceptors/files.interceptor'
import { MimeTypes } from 'http-constants-ts'
import { UpdatePasswordSchemaDto } from './schemas/UpdatePassword.schema'
import { AuthenticationService } from '../authentication/authentication.service'
import {
  UpdateUserAdminInputSchema,
  UpdateUserInputSchema,
} from './schemas/UpdateUserInput.schema'
import { M2MOnly } from '@/authentication/guards/M2MOnly.guard'
import { ListUsersPaginationSchema } from '@/users/schemas/ListUsersPagination.schema'

@Controller('users')
@UsePipes(ZodValidationPipe)
export class UsersController {
  private readonly logger = new Logger(UsersController.name)

  constructor(
    private usersService: UsersService,
    private readonly filesService: FilesService,
    private readonly authenticationService: AuthenticationService,
  ) {}

  private parseId(id: string): number {
    const parsed = parseInt(id)
    if (isNaN(parsed)) {
      throw new BadRequestException(`Invalid id: ${id}`)
    }
    return parsed
  }

  @UseGuards(M2MOnly)
  @Get()
  async list(@Query() query: ListUsersPaginationSchema) {
    const { data, meta } = await this.usersService.listUsers(query)
    return {
      data: data.map((user) => ReadUserOutputSchema.parse(user)),
      meta,
    }
  }

  @Get('me')
  async findMe(@ReqUser() user: User) {
    return ReadUserOutputSchema.parse(
      await this.usersService.findUser({ id: user.id }),
    )
  }

  @Put('me')
  async updateMe(@ReqUser() user: User, @Body() body: UpdateUserInputSchema) {
    return ReadUserOutputSchema.parse(
      await this.usersService.updateUser({ id: user.id }, body ?? {}),
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
    return this.usersService.patchUserMetaData(user.id, meta)
  }

  @Post('me/upload-image')
  @UseInterceptors(
    FilesInterceptor('file', {
      mode: 'buffer',
      mimeTypes: [
        MimeTypes.IMAGE_JPEG,
        MimeTypes.IMAGE_GIF,
        MimeTypes.IMAGE_PNG,
      ],
    }),
  )
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

  @Put('files/generate-signed-upload-url')
  async generateSignedUploadUrl(@Body() args: GenerateSignedUploadUrlArgsDto) {
    return {
      signedUploadUrl: await this.filesService.generateSignedUploadUrl(args),
    }
  }

  @UseGuards(M2MOnly)
  @Put(':id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: UpdateUserAdminInputSchema,
  ) {
    return ReadUserOutputSchema.parse(
      await this.usersService.updateUser({ id: this.parseId(id) }, body),
    )
  }

  @UseGuards(UserOwnerOrAdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string, @ReqUser() user: User) {
    const paramId = this.parseId(id)
    if (user && paramId === user.id) {
      return ReadUserOutputSchema.parse(user)
    }

    const dbUser = await this.usersService.findUser({ id: paramId })
    if (!dbUser) {
      throw new NotFoundException('User not found')
    }
    return ReadUserOutputSchema.parse(dbUser)
  }

  @UseGuards(UserOwnerOrAdminGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    try {
      return await this.usersService.deleteUser(this.parseId(id))
    } catch (error: unknown | PrismaClientKnownRequestError) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        this.logger.warn(
          `request to delete user that does not exist, w/ id: ${id}`,
        )
        return
      }
      throw error
    }
  }

  @UseGuards(UserOwnerOrAdminGuard)
  @Put(':id/password')
  async updatePassword(
    @Body() body: UpdatePasswordSchemaDto,
    @ReqUser() user: User,
  ) {
    const { hasPassword, password } = user
    const { newPassword, oldPassword } = body
    if (hasPassword) {
      if (!oldPassword) {
        throw new BadRequestException('oldPassword is required')
      }
      const passwordValidated =
        await this.authenticationService.validatePassword(
          oldPassword,
          password || '',
        )
      if (!passwordValidated) {
        throw new UnauthorizedException('Invalid password')
      }
    }
    return this.usersService.updatePassword(user.id, newPassword)
  }
}
