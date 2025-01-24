import { User, UserRole } from '@prisma/client'

export function getFullName(user: User) {
  return `${user.firstName} ${user.lastName}`
}

/** Helper to check a User's roles against one or many roles */
export function userHasRole(user: User, roleOrRoles: UserRole | UserRole[]) {
  const userRoles = user.roles

  if (!userRoles || userRoles.length === 0) return false

  if (Array.isArray(roleOrRoles)) {
    return roleOrRoles.some((element) => userRoles.includes(element))
  }

  return userRoles.includes(roleOrRoles)
}

export function isAdmin(user: User) {
  return userHasRole(user, UserRole.admin)
}
