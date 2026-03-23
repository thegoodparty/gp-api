import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '@/authentication/decorators/PublicAccess.decorator'
import { UserRole } from '@prisma/client'
import { ROLES_KEY } from '@/authentication/decorators/Roles.decorator'

export const routeIsPublicAndNoRoles = (
  context: ExecutionContext,
  reflector: Reflector,
): boolean => {
  // Check if the route or class is marked as public
  const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ])

  // Check if the route or class has specific roles specified
  const roles = reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
    context.getHandler(),
    context.getClass(),
  ])

  return Boolean(isPublic && !roles)
}
