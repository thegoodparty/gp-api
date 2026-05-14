import { ElectedOffice, User } from '@prisma/client'
import { SpeechToTextTargetType } from '@goodparty_org/contracts'

export type AuthorizeTargetInput = {
  user: User
  electedOffice: ElectedOffice
  targetId: string
}

export interface TargetAuthorizer<
  TTarget extends SpeechToTextTargetType = SpeechToTextTargetType,
> {
  readonly type: TTarget
  authorizeWrite(input: AuthorizeTargetInput): Promise<void>
}
