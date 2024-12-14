import { ImportTemplate } from '@hubspot/api-client/lib/codegen/crm/imports';
import {
  Transformer,
  PromptInputFieldsAugmented,
  PromptInputFieldsRaw,
  PromptInputQuestion
} from '../content.types';

export const promptInputFieldsTransformer: Transformer<
  PromptInputFieldsRaw,
  PromptInputFieldsAugmented
> = (prompts: PromptInputFieldsRaw[]): PromptInputFieldsAugmented[] => {
  const promptInputFields = {};
  for (const prompt of prompts) {
    const entry: PromptInputQuestion[] = [];
    const key = prompt.data.fieldId;
    for (const input of prompt.data.contentInput) {
      const { title, helperText } = input.fields;
      entry.push({
        title,
        helperText
      })
    }
    promptInputFields[key] = entry;
  }

  return [promptInputFields];
}