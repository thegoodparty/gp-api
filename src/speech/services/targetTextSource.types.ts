import { Organization, User } from '@prisma/client'

export type LoadTextInput = {
  id: string
  user: User
  organization: Organization
}

export type LoadedText = {
  text: string
  cacheKey: string
}

export interface TargetTextSource<TTarget extends string> {
  readonly type: TTarget
  loadText(input: LoadTextInput): Promise<LoadedText>
}
