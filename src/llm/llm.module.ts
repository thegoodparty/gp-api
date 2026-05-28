import { Module } from '@nestjs/common'
import { streamText } from 'ai'
import {
  AI_SDK_PROVIDER_FACTORY_TOKEN,
  ANTHROPIC_PROVIDER_FACTORY_TOKEN,
  defaultAiSdkProviderFactory,
  defaultAnthropicProviderFactory,
  defaultOpenAIClientFactory,
  LlmService,
  OPENAI_CLIENT_FACTORY_TOKEN,
  STREAM_TEXT_TOKEN,
} from './services/llm.service'

@Module({
  providers: [
    LlmService,
    { provide: STREAM_TEXT_TOKEN, useValue: streamText },
    {
      provide: OPENAI_CLIENT_FACTORY_TOKEN,
      useValue: defaultOpenAIClientFactory,
    },
    {
      provide: AI_SDK_PROVIDER_FACTORY_TOKEN,
      useValue: defaultAiSdkProviderFactory,
    },
    {
      provide: ANTHROPIC_PROVIDER_FACTORY_TOKEN,
      useValue: defaultAnthropicProviderFactory,
    },
  ],
  exports: [LlmService],
})
export class LlmModule {}
