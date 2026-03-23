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
  UsePipes,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { Roles } from 'src/authentication/decorators/Roles.decorator'
import { UsersService } from 'src/users/services/users.service'
import {
  AdminUserListSchema,
  DateRangeFilter,
} from './schemas/AdminUserList.schema'
import { subDays, subMonths } from 'date-fns'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { AdminCreateUserSchema } from './schemas/AdminCreateUser.schema'
import { AdminImpersonateSchema } from './schemas/AdminImpersonate.schema'
import { AuthenticationService } from 'src/authentication/authentication.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { ReadUserOutputSchema } from '@goodparty_org/contracts'
import { UserRole } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'

@Controller('admin/users')
@Roles(UserRole.admin)
@UsePipes(ZodValidationPipe)
export class AdminUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly campaignsService: CampaignsService,
    private readonly authService: AuthenticationService,
    private readonly slack: SlackService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdminUsersController.name)
  }

  @Get()
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

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    return await this.usersService.findUniqueOrThrow({ where: { id } })
  }

  @Post()
  create(@Body() body: AdminCreateUserSchema) {
    return this.usersService.createUser(body)
  }

  @Post('impersonate')
  @HttpCode(HttpStatus.OK)
  async impersonate(@Body() { email }: AdminImpersonateSchema) {
    const user = await this.usersService.findUserByEmail(email)

    if (!user) {
      throw new BadRequestException('Invalid user')
    }

    const token = await this.authService.generateAuthToken({
      email: user.email,
      sub: user.id,
    })

    return { user: ReadUserOutputSchema.parse(user), token }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findUniqueOrThrow({ where: { id } })

    await this.campaignsService.deleteAll({ where: { userId: user.id } })
    await this.usersService.deleteUser(user.id)

    return true
  }
}
