import { IncomingRequest } from '@/authentication/authentication.types'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { AdminOrM2MGuard } from '@/authentication/guards/AdminOrM2M.guard'
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { Prisma, UserRole } from '@prisma/client'
import { subDays, subMonths } from 'date-fns'
import { PinoLogger } from 'nestjs-pino'
import { ZodValidationPipe } from 'nestjs-zod'
import { Roles } from 'src/authentication/decorators/Roles.decorator'
import { UsersService } from 'src/users/services/users.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { AdminCreateUserSchema } from './schemas/AdminCreateUser.schema'
import {
  AdminUserListSchema,
  DateRangeFilter,
} from './schemas/AdminUserList.schema'

@Controller('admin/users')
@UsePipes(ZodValidationPipe)
export class AdminUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly slack: SlackService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdminUsersController.name)
  }

  @Get()
  @Roles(UserRole.admin)
  async list(@Query() { dateRange }: AdminUserListSchema) {
    if (!dateRange || dateRange === DateRangeFilter.allTime) {
      return this.usersService.findMany()
    }
    let date = new Date()
    if (dateRange === DateRangeFilter.last12Months) {
      date = subMonths(date, 12)
    } else if (dateRange === DateRangeFilter.last30Days) {
      date = subDays(date, 30)
    } else if (dateRange === DateRangeFilter.lastWeek) {
      date = subDays(date, 7)
    } else {
      // input validation should prevent this case
      throw new BadRequestException('Invalid date range')
    }

    return this.usersService.findMany({ where: { createdAt: { gt: date } } })
  }

  @Get('search')
  @UseGuards(AdminOrM2MGuard)
  async searchByEmail(@Query('email') email: string) {
    return this.usersService.findMany({
      where: { email: { contains: email, mode: Prisma.QueryMode.insensitive } },
      take: 10,
      select: { id: true, email: true, name: true },
    })
  }

  @Get(':id')
  @Roles(UserRole.admin)
  async get(@Param('id', ParseIntPipe) id: number) {
    return await this.usersService.findUniqueOrThrow({ where: { id } })
  }

  @Post()
  @Roles(UserRole.admin)
  create(@Body() body: AdminCreateUserSchema) {
    return this.usersService.createUser(body)
  }

  @Post('impersonate/:id')
  @UseGuards(AdminOrM2MGuard)
  async impersonate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: IncomingRequest,
    @Body() body: { actorEmail?: string },
  ) {
    // In an impersonating session, req.user is the candidate — never use it as actor
    let actorClerkId =
      req.actorUser?.clerkId ??
      (req.user?.impersonating ? undefined : req.user?.clerkId)

    if (!actorClerkId) {
      if (!body.actorEmail) {
        throw new BadRequestException(
          'actorEmail is required when using M2M auth',
        )
      }
      actorClerkId = body.actorEmail
    }

    this.logger.info(
      { targetUserId: id, actorClerkId, authSource: req.user ? 'user' : 'm2m' },
      'Impersonation request received',
    )

    const user = await this.usersService.findUniqueOrThrow({ where: { id } })
    return this.usersService.impersonateUser(user.id, actorClerkId)
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @ReqUser() reqUser: { id: number },
  ) {
    const user = await this.usersService.findUniqueOrThrow({ where: { id } })

    await this.usersService.deleteUser(user.id, reqUser.id)

    return true
  }
}
