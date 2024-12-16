import {
  Body,
  Controller,
  Delete,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { CampaignsAiService } from './campaignsAi.service'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { RenameAiContentSchema } from './schemas/RenameAiContent.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { User } from '@prisma/client'
import { DeleteAiContentSchema } from './schemas/DeleteAiContent.schema'
import { CreateAiContentSchema } from './schemas/CreateAiContent.schema'

@Controller('campaigns/ai')
@UsePipes(ZodValidationPipe)
// @UseGuards(CampaignOwnersOrAdminGuard) // TODO: need guard to check user has campaign?
export class CampaignsAiController {
  constructor(private aiService: CampaignsAiService) {}

  @Post()
  create(@ReqUser() user: User, @Body() body: CreateAiContentSchema) {
    return this.aiService.createContent(user.id, body)
  }

  @Post('rename')
  rename(@ReqUser() user: User, @Body() body: RenameAiContentSchema) {
    return this.aiService.updateContentName(user.id, body)
  }

  @Delete()
  delete(@ReqUser() user: User, @Body() { key }: DeleteAiContentSchema) {
    return this.aiService.deleteContent(user.id, key)
  }
}
