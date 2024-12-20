import { User, UserRole } from '@prisma/client'

/** Helper to check a User's roles against one or many roles */
export function userHasRole(user: User, roleOrRoles: UserRole | UserRole[]) {
  const userRoles = user.roles

  if (!userRoles || userRoles.length === 0) return false

  if (Array.isArray(roleOrRoles)) {
    return roleOrRoles.every((element) => userRoles.includes(element))
  }

  return userRoles.includes(roleOrRoles)
}
