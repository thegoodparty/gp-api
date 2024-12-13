import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'
/** Tells JwtAuthGuard to skip auth for the controller/handler this decorator is applied to */
export const PublicAccess = () => SetMetadata(IS_PUBLIC_KEY, true)
