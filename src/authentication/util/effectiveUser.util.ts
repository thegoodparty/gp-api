import { IncomingRequest } from '@/authentication/authentication.types'

export const effectiveUser = (req: IncomingRequest) => req.actorUser ?? req.user
