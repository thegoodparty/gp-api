import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name)
}
