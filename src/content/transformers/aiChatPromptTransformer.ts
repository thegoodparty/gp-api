import { Logger } from '@nestjs/common';
import {
  Transformer,
  AIChatPrompt,
  AIChatPrompts,
} from '../content.types';
import { camelCase } from 'lodash';

export const aiChatPromptsTransformer: Transformer<
  AIChatPrompt,
  AIChatPrompts
> = (prompts: AIChatPrompt[]): AIChatPrompts[] => {
  const aiChatPrompts = {};

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const { name } = prompt.data;
    aiChatPrompts[name] = {
      ...prompt.data,
      id: prompt.id
    }
  }
  return [aiChatPrompts];
}