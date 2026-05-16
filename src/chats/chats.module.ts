import { Module } from '@nestjs/common'
import { LlmModule } from '@/llm/llm.module'
import { ChatStoreService } from './services/chatStore.prisma'
import { ChatStreamService } from './services/chatStream.service'

@Module({
  imports: [LlmModule],
  providers: [ChatStoreService, ChatStreamService],
  exports: [ChatStoreService, ChatStreamService],
})
export class ChatsModule {}
