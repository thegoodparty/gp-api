import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import {
  ListUsersPaginationSchema,
  ReadUserOutputSchema,
  UpdatePasswordSchema,
} from '@goodparty_org/contracts'
import { User } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { UserOwnerOrAdminGuard } from './guards/UserOwnerOrAdmin.guard'
import { GenerateSignedUploadUrlArgsDto } from './schemas/GenerateSignedUploadUrlArgs.schema'
import { createZodDto, ZodValidationPipe } from 'nestjs-zod'
import { UpdateMetadataSchema } from './schemas/UpdateMetadata.schema'
import { S3Service } from 'src/vendors/aws/services/s3.service'
import { FileUpload } from 'src/files/files.types'
import { ReqFile } from 'src/files/decorators/ReqFiles.decorator'
import { FilesInterceptor } from 'src/files/interceptors/files.interceptor'
import { CacheControls, MimeTypes } from 'http-constants-ts'
import { ASSET_DOMAIN } from 'src/shared/util/appEnvironment.util'
import { AuthenticationService } from '../authentication/authentication.service'
import {
  UpdateUserAdminInputSchema,
  UpdateUserInputSchema,
} from './schemas/UpdateUserInput.schema'
import { UserIdParamSchema } from './schemas/UserIdParam.schema'
import { M2MOnly } from '@/authentication/guards/M2MOnly.guard'
import { ZodResponseInterceptor } from '@/shared/interceptors/ZodResponse.interceptor'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { PaginatedResponseSchema } from '@/shared/schemas/PaginatedResponse.schema'
import { PinoLogger } from 'nestjs-pino'

class ListUsersPaginationDto extends createZodDto(ListUsersPaginationSchema) {}

class UpdatePasswordDto extends createZodDto(UpdatePasswordSchema) {}

@Controller('users')
@UsePipes(ZodValidationPipe)
@UseInterceptors(ZodResponseInterceptor)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private readonly s3: S3Service,
    private readonly authenticationService: AuthenticationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersController.name)
  }

  @UseGuards(M2MOnly)
  @Get()
  @ResponseSchema(PaginatedResponseSchema(ReadUserOutputSchema))
  async list(@Query() query: ListUsersPaginationDto) {
    const { data, meta } = await this.usersService.listUsers(query)
    return { data, meta }
  }

  @Get('me')
  @ResponseSchema(ReadUserOutputSchema)
  async findMe(@ReqUser() user: User) {
    return this.usersService.findUser({ id: user.id })
  }

  @Put('me')
  @ResponseSchema(ReadUserOutputSchema)
  async updateMe(@ReqUser() user: User, @Body() body: UpdateUserInputSchema) {
    return this.usersService.updateUser({ id: user.id }, body ?? {})
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
  @ResponseSchema(ReadUserOutputSchema)
  async uploadImage(@ReqUser() user: User, @ReqFile() file?: FileUpload) {
    if (!file) {
      throw new BadRequestException('No file found')
    }

    const key = this.s3.buildKey('uploads', file.filename)
    const avatar = await this.s3.uploadFile(ASSET_DOMAIN, file.data, key, {
      contentType: file.mimetype,
      cacheControl: `${CacheControls.MAX_AGE}=${31_536_000}`,
      baseUrl: `https://${ASSET_DOMAIN}`,
    })
    return this.usersService.updateUser({ id: user.id }, { avatar })
  }

  @Put('files/generate-signed-upload-url')
  async generateSignedUploadUrl(
    @ReqUser() user: User,
    @Body() args: GenerateSignedUploadUrlArgsDto,
  ) {
    if (!user) {
      throw new UnauthorizedException('User session required')
    }
    const scopedFolder = `${args.bucket}/${user.id}`
    const key = this.s3.buildKey(scopedFolder, args.fileName)
    return {
      signedUploadUrl: await this.s3.getSignedUrlForUpload(
        ASSET_DOMAIN,
        key,
        { contentType: args.fileType },
      ),
    }
  }

  @UseGuards(M2MOnly)
  @Put(':id')
  @ResponseSchema(ReadUserOutputSchema)
  async updateUser(
    @Param() { id }: UserIdParamSchema,
    @Body() body: UpdateUserAdminInputSchema,
  ) {
    return this.usersService.updateUser({ id }, body)
  }

  @UseGuards(UserOwnerOrAdminGuard)
  @Get(':id')
  @ResponseSchema(ReadUserOutputSchema)
  async findOne(@Param() { id }: UserIdParamSchema, @ReqUser() user: User) {
    if (user && id === user.id) {
      return user
    }

    const dbUser = await this.usersService.findUser({ id })
    if (!dbUser) {
      throw new NotFoundException('User not found')
    }
    return dbUser
  }

  @UseGuards(UserOwnerOrAdminGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param() { id }: UserIdParamSchema, @ReqUser() reqUser: User) {
    try {
      return await this.usersService.deleteUser(id, reqUser.id)
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
  async updatePassword(@Body() body: UpdatePasswordDto, @ReqUser() user: User) {
    const { hasPassword, password } = user
    const { newPassword, oldPassword } = body
    if (hasPassword && !oldPassword) {
      throw new BadRequestException('oldPassword is required')
    }
    if (oldPassword) {
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
