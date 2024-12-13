import { SetMetadata } from '@nestjs/common'
import { UserRole } from '@prisma/client'

export const ROLES_KEY = 'roles'
/** Tells the RolesGuard to ensure the authed user has one of the required roles */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles)
